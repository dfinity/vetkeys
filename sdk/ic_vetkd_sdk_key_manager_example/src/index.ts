import { Principal } from "@dfinity/principal";
import { ActorSubclass, HttpAgent } from "@dfinity/agent";
import { createActor } from "./declarations/key_manager_example/index.js";
import { _SERVICE as _DEFAULT_KEY_MANAGER_SERVICE, AccessRights, ByteBuf } from "./declarations/key_manager_example/key_manager_example.did.js";
import { KeyManagerClient } from "ic_vetkd_sdk_key_manager/src/index.js";

export class DefaultKeyManagerClient implements KeyManagerClient {
    canisterId: string;
    actor: ActorSubclass<_DEFAULT_KEY_MANAGER_SERVICE>;
    verification_key: ByteBuf | undefined = undefined;

    constructor(agent: HttpAgent, canisterId: string) {
        this.canisterId = canisterId;
        this.actor = createActor(canisterId, { agent });
    }

    get_accessible_shared_key_ids(): Promise<[Principal, ByteBuf][]> {
        return this.actor.get_accessible_shared_key_ids();
    }

    set_user_rights(owner: Principal, vetkey_name: string, user: Principal, user_rights: AccessRights): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }> {
        return this.actor.set_user_rights(owner, string_to_bytebuf(vetkey_name), user, user_rights);
    }

    get_user_rights(owner: Principal, vetkey_name: string, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }> {
        return this.actor.get_user_rights(owner, string_to_bytebuf(vetkey_name), user);
    }

    remove_user(owner: Principal, vetkey_name: string, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }> {
        return this.actor.remove_user(owner, string_to_bytebuf(vetkey_name), user);
    }

    async get_encrypted_vetkey(key_owner: Principal, vetkey_name: string, transport_key: Uint8Array): Promise<{ 'Ok': ByteBuf } |
    { 'Err': string }> {
        return await this.actor.get_encrypted_vetkey(key_owner, string_to_bytebuf(vetkey_name), { inner: transport_key });
    }

    async get_vetkey_verification_key(): Promise<ByteBuf> {
        if (this.verification_key) {
            return this.verification_key;
        } else {
            this.verification_key = await this.actor.get_vetkey_verification_key();
            return this.verification_key;
        }
    }
}

function string_to_bytebuf(s: string): ByteBuf {
    return { inner: new TextEncoder().encode(s) };
}
