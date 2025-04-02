import { Principal } from "@dfinity/principal";
import { ActorSubclass, HttpAgent } from "@dfinity/agent";
import { createActor } from "../declarations/ic_vetkeys_manager_canister/index.js";
import { _SERVICE as _DEFAULT_KEY_MANAGER_SERVICE, AccessRights, ByteBuf } from "../declarations/ic_vetkeys_manager_canister/ic_vetkeys_manager_canister.did.js";
import { KeyManagerClient } from "./key_manager.js";

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

    set_user_rights(owner: Principal, vetkey_name: ByteBuf, user: Principal, user_rights: AccessRights): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }> {
        return this.actor.set_user_rights(owner, vetkey_name, user, user_rights);
    }

    get_user_rights(owner: Principal, vetkey_name: ByteBuf, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }> {
        return this.actor.get_user_rights(owner, vetkey_name, user);
    }

    remove_user(owner: Principal, vetkey_name: ByteBuf, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }> {
        return this.actor.remove_user(owner, vetkey_name, user);
    }

    async get_encrypted_vetkey(key_owner: Principal, vetkey_name: ByteBuf, transport_key: ByteBuf): Promise<{ 'Ok': ByteBuf } |
    { 'Err': string }> {
        return await this.actor.get_encrypted_vetkey(key_owner, vetkey_name, transport_key);
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
