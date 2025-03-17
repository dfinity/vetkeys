import { writable } from 'svelte/store';
import { passwordFromContent, type PasswordModel } from '../lib/password';
import { vaultFromContent, type VaultModel } from '../lib/vault';
import { auth } from './auth';
import { showError } from './notifications';
import { type AccessRights, EncryptedMaps } from 'ic_vetkd_sdk_encrypted_maps/src';
import type { Principal } from '@dfinity/principal';

export const vaultsStore = writable<
    | {
        state: 'uninitialized';
    }
    | {
        state: 'loading';
    }
    | {
        state: 'loaded';
        list: VaultModel[];
    }
    | {
        state: 'error';
    }
>({ state: 'uninitialized' });

let vaultPollerHandle: ReturnType<typeof setInterval> | null;

function updateVaults(vaults: VaultModel[]) {
    vaultsStore.set({
        state: 'loaded',
        list: vaults,
    });
}

export async function refreshVaults(
    owner: Principal,
    encryptedMaps: EncryptedMaps
) {
    const vaultsOwnedByMe = await encryptedMaps.get_owned_non_empty_map_names();
    if ("Err" in vaultsOwnedByMe) {
        throw new Error(vaultsOwnedByMe.Err);
    }

    let ownedNamesString = "";
    for (const nameBytes of vaultsOwnedByMe.Ok) {
        ownedNamesString += new TextDecoder().decode(Uint8Array.from(nameBytes.inner)) + ", ";
    }

    const vaultsSharedWithMe = await encryptedMaps.get_accessible_shared_map_names();

    let vaultIds = new Array<[Principal, string]>();

    for (const vaultNameBytes of vaultsOwnedByMe.Ok) {
        const vaultName = new TextDecoder().decode(Uint8Array.from(vaultNameBytes.inner));
        vaultIds.push([owner, vaultName]);
    }

    for (const [otherOwner, vaultNameBytes] of vaultsSharedWithMe) {
        const vaultName = new TextDecoder().decode(Uint8Array.from(vaultNameBytes.inner));
        vaultIds.push([otherOwner, vaultName]);
    }

    let vaults = new Array();

    for (const [otherOwner, vaultName] of vaultIds) {
        const result = await encryptedMaps.get_values_for_map(otherOwner, vaultName);
        if ("Err" in result) {
            throw new Error(result.Err);
        }

        let passwords = new Array<[string, PasswordModel]>();
        for (const [passwordNameBytebuf, data] of result.Ok) {
            const passwordNameString = new TextDecoder().decode(Uint8Array.from(passwordNameBytebuf.inner));
            const passwordContent = new TextDecoder().decode(Uint8Array.from(data.inner));
            const password = passwordFromContent(otherOwner, vaultName, passwordNameString, passwordContent);
            passwords.push([passwordNameString, password]);
        }

        const usersResult = await encryptedMaps.get_shared_user_access_for_map(otherOwner, vaultName);
        if ("Err" in usersResult) {
            throw new Error(usersResult.Err);
        }

        vaults.push(vaultFromContent(otherOwner, vaultName, passwords, usersResult.Ok));
    }

    updateVaults(vaults);
}

export async function addPassword(
    password: PasswordModel,
    encryptedMaps: EncryptedMaps
) {
    let result = await encryptedMaps.set_value(password.owner, password.parentVaultName, password.passwordName, new TextEncoder().encode(password.content));
    if ("Err" in result) {
        throw new Error(result.Err);
    }
}

export async function removePassword(
    password: PasswordModel,
    encryptedMaps: EncryptedMaps
) {
    let result = await encryptedMaps.remove_encrypted_value(password.owner, password.parentVaultName, password.passwordName);
    if ("Err" in result) {
        throw new Error(result.Err);
    }
}

export async function updatePassword(
    password: PasswordModel,
    encryptedMaps: EncryptedMaps
) {
    let result = await encryptedMaps.set_value(password.owner, password.parentVaultName, password.passwordName, new TextEncoder().encode(password.content));
    if ("Err" in result) {
        throw new Error(result.Err);
    }
}

export async function addUser(
    owner: Principal,
    vaultName: string,
    user: Principal,
    userRights: AccessRights,
    encryptedMaps: EncryptedMaps
) {
    const result = await encryptedMaps.set_user_rights(owner, vaultName, user, userRights);
    if ("Err" in result) {
        throw new Error(result.Err);
    }
}

export async function removeUser(
    owner: Principal,
    vaultName: string,
    user: Principal,
    encryptedMaps: EncryptedMaps
) {
    const result = await encryptedMaps.remove_user(owner, vaultName, user);
    if ("Err" in result) {
        throw new Error(result.Err);
    }
}

auth.subscribe(async ($auth) => {
    if ($auth.state === 'initialized') {
        if (vaultPollerHandle !== null) {
            clearInterval(vaultPollerHandle);
            vaultPollerHandle = null;
        }

        vaultsStore.set({
            state: 'loading',
        });
        try {
            await refreshVaults($auth.client.getIdentity().getPrincipal(), $auth.encryptedMaps).catch((e) =>
                showError(e, 'Could not poll vaults.')
            );

            vaultPollerHandle = setInterval(async () => {
                await refreshVaults($auth.client.getIdentity().getPrincipal(), $auth.encryptedMaps).catch((e) =>
                    showError(e, 'Could not poll vaults.')
                );
            }, 3000);
        } catch {
            vaultsStore.set({
                state: 'error',
            });
        }
    } else if ($auth.state === 'anonymous' && vaultPollerHandle !== null) {
        clearInterval(vaultPollerHandle);
        vaultPollerHandle = null;
        vaultsStore.set({
            state: 'uninitialized',
        });
    }
});