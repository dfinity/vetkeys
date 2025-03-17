import "./init.ts";
import { type ActorSubclass, type HttpAgentOptions } from "@dfinity/agent";
import { EncryptedMaps } from "ic_vetkd_sdk_encrypted_maps/src";
import { createEncryptedMaps } from "./encrypted_maps";
import type { Principal } from "@dfinity/principal";
import { createActor } from "../declarations/index";
import type { _SERVICE } from "../declarations/password_manager_with_metadata.did";
import { passwordFromContent, type PasswordModel } from "../lib/password";
import { vaultFromContent, type VaultModel } from "../lib/vault";

export class PasswordManager {
    /// The actor class representing the full interface of the canister.
    private readonly canisterClient: ActorSubclass<_SERVICE>;
    // TODO: inaccessible API are get, instert and remove
    readonly encryptedMaps: EncryptedMaps;

    constructor(
        canisterClient: ActorSubclass<_SERVICE>,
        encryptedMaps: EncryptedMaps,
    ) {
        this.canisterClient = canisterClient;
        this.encryptedMaps = encryptedMaps;
    }

    async setPassword(
        owner: Principal,
        vault: string,
        passwordName: string,
        password: Uint8Array,
        tags: string[],
        url: string,
    ): Promise<{ Ok: null } | { Err: string }> {
        const encryptedPassword = await this.encryptedMaps.encrypt_for(
            owner,
            vault,
            passwordName,
            password,
        );
        if ("Err" in encryptedPassword) {
            return encryptedPassword;
        }
        const maybeError =
            await this.canisterClient.insert_encrypted_value_with_metadata(
                owner,
                stringToBytebuf(vault),
                stringToBytebuf(passwordName),
                { inner: encryptedPassword.Ok },
                tags,
                url,
            );
        if ("Err" in maybeError) {
            return maybeError;
        } else {
            return { Ok: null };
        }
    }

    async getDecryptedVaults(
        owner: Principal,
    ): Promise<{ Ok: VaultModel[] } | { Err: string }> {
        const vaultsSharedWithMe =
            await this.encryptedMaps.get_accessible_shared_map_names();
        const vaultsOwnedByMeResult =
            await this.encryptedMaps.get_owned_non_empty_map_names();
        if ("Err" in vaultsOwnedByMeResult) {
            return vaultsOwnedByMeResult;
        }

        const vaultIds = new Array<[Principal, string]>();
        for (const vaultNameBytes of vaultsOwnedByMeResult.Ok) {
            const vaultName = new TextDecoder().decode(
                Uint8Array.from(vaultNameBytes.inner),
            );
            vaultIds.push([owner, vaultName]);
        }
        for (const [otherOwner, vaultNameBytes] of vaultsSharedWithMe) {
            const vaultName = new TextDecoder().decode(
                Uint8Array.from(vaultNameBytes.inner),
            );
            vaultIds.push([otherOwner, vaultName]);
        }

        const vaults = [];

        for (const [otherOwner, vaultName] of vaultIds) {
            const result =
                await this.canisterClient.get_encrypted_values_for_map_with_metadata(
                    otherOwner,
                    { inner: new TextEncoder().encode(vaultName) },
                );
            if ("Err" in result) {
                throw new Error(result.Err);
            }

            const passwords = new Array<[string, PasswordModel]>();
            for (const [
                passwordNameBytebuf,
                encryptedData,
                passwordMetadata,
            ] of result.Ok) {
                const passwordNameString = new TextDecoder().decode(
                    Uint8Array.from(passwordNameBytebuf.inner),
                );
                const data = await this.encryptedMaps.decrypt_for(
                    otherOwner,
                    vaultName,
                    passwordNameString,
                    Uint8Array.from(encryptedData.inner),
                );
                if ("Err" in data) {
                    throw new Error(data.Err);
                }
                const passwordContent = new TextDecoder().decode(
                    Uint8Array.from(data.Ok),
                );
                const password = passwordFromContent(
                    otherOwner,
                    vaultName,
                    passwordNameString,
                    passwordContent,
                    passwordMetadata,
                );
                passwords.push([passwordNameString, password]);
            }

            const usersResult =
                await this.encryptedMaps.get_shared_user_access_for_map(
                    otherOwner,
                    vaultName,
                );
            if ("Err" in usersResult) {
                throw new Error(usersResult.Err);
            }

            vaults.push(
                vaultFromContent(
                    otherOwner,
                    vaultName,
                    passwords,
                    usersResult.Ok,
                ),
            );
        }

        return { Ok: vaults };
    }

    async removePassword(
        owner: Principal,
        vault: string,
        passwordName: string,
    ): Promise<{ Ok: null } | { Err: string }> {
        const maybeError =
            await this.canisterClient.remove_encrypted_value_with_metadata(
                owner,
                stringToBytebuf(vault),
                stringToBytebuf(passwordName),
            );
        if ("Err" in maybeError) {
            return maybeError;
        } else {
            return { Ok: null };
        }
    }
}

export async function createPasswordManager(
    agentOptions?: HttpAgentOptions,
): Promise<PasswordManager> {
    const { CANISTER_ID_PASSWORD_MANAGER_WITH_METADATA } = process.env;
    if (!CANISTER_ID_PASSWORD_MANAGER_WITH_METADATA) {
        console.error(
            "CANISTER_ID_PASSWORD_MANAGER_WITH_METADATA is not defined",
        );
        throw new Error(
            "CANISTER_ID_PASSWORD_MANAGER_WITH_METADATA is not defined",
        );
    }

    const host =
        process.env.DFX_NETWORK === "ic"
            ? `https://${CANISTER_ID_PASSWORD_MANAGER_WITH_METADATA}.ic0.app`
            : "http://localhost:8000";
    const hostOptions = { host };

    if (!agentOptions) {
        agentOptions = hostOptions;
    } else {
        agentOptions.host = hostOptions.host;
    }

    const encryptedMaps = await createEncryptedMaps({ ...agentOptions });
    const canisterClient = createActor(
        CANISTER_ID_PASSWORD_MANAGER_WITH_METADATA,
        { agentOptions },
    );

    return new PasswordManager(canisterClient, encryptedMaps);
}

function stringToBytebuf(str: string): { inner: Uint8Array } {
    return { inner: new TextEncoder().encode(str) };
}
