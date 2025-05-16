import { writable } from "svelte/store";
import { type PasswordModel } from "../lib/password";
import { type VaultModel } from "../lib/vault";
import { auth, type AuthState } from "./auth";
import { showError } from "./notifications";
import { type AccessRights } from "@dfinity/vetkeys/encrypted_maps";
import type { Principal } from "@dfinity/principal";
import type { PasswordManager } from "../lib/password_manager";

export const vaultsStore = writable<
    | {
          state: "uninitialized";
      }
    | {
          state: "loading";
      }
    | {
          state: "loaded";
          list: VaultModel[];
      }
    | {
          state: "error";
      }
>({ state: "uninitialized" });

let vaultPollerHandle: ReturnType<typeof setInterval> | null;

function updateVaults(vaults: VaultModel[]) {
    vaultsStore.set({
        state: "loaded",
        list: vaults,
    });
}

export async function refreshVaults(
    owner: Principal,
    passwordManager: PasswordManager,
) {
    updateVaults(await passwordManager.getDecryptedVaults(owner));
}

export async function setPassword(
    parentVaultOwner: Principal,
    parentVaultName: string,
    passwordName: string,
    password: string,
    url: string,
    tags: string[],
    passwordManager: PasswordManager,
) {
    const result = await passwordManager.setPassword(
        parentVaultOwner,
        parentVaultName,
        passwordName,
        new TextEncoder().encode(password),
        tags,
        url,
    );
    if ("Err" in result) {
        throw new Error(result.Err);
    }
}

export async function removePassword(
    password: PasswordModel,
    passwordManager: PasswordManager,
) {
    const result = await passwordManager.removePassword(
        password.owner,
        password.parentVaultName,
        password.passwordName,
    );
    if ("Err" in result) {
        throw new Error(result.Err);
    }
}

export async function addUser(
    owner: Principal,
    vaultName: string,
    user: Principal,
    userRights: AccessRights,
    passwordManager: PasswordManager,
) {
    await passwordManager.encryptedMaps.setUserRights(
        owner,
        new TextEncoder().encode(vaultName),
        user,
        userRights,
    );
}

export async function removeUser(
    owner: Principal,
    vaultName: string,
    user: Principal,
    passwordManager: PasswordManager,
) {
    await passwordManager.encryptedMaps.removeUser(
        owner,
        new TextEncoder().encode(vaultName),
        user,
    );
}

auth.subscribe(() => {
    void (async ($auth) => {
        if (!$auth) {
            throw Error("$auth is undefined");
        }
        const authTyped = $auth as AuthState;
        if (authTyped.state === "initialized") {
            if (vaultPollerHandle !== null) {
                clearInterval(vaultPollerHandle);
                vaultPollerHandle = null;
            }

            vaultsStore.set({
                state: "loading",
            });
            try {
                await refreshVaults(
                    authTyped.client.getIdentity().getPrincipal(),
                    authTyped.passwordManager,
                ).catch((e) => showError(e as Error, "Could not poll vaults."));

                vaultPollerHandle = setInterval(() => {
                    void (async () => {
                        await refreshVaults(
                            authTyped.client.getIdentity().getPrincipal(),
                            authTyped.passwordManager,
                        ).catch((e) =>
                            showError(e as Error, "Could not poll vaults."),
                        );
                    })();
                }, 3000);
            } catch {
                vaultsStore.set({
                    state: "error",
                });
            }
        } else if (
            authTyped.state === "anonymous" &&
            vaultPollerHandle !== null
        ) {
            clearInterval(vaultPollerHandle);
            vaultPollerHandle = null;
            vaultsStore.set({
                state: "uninitialized",
            });
        }
    })();
});
