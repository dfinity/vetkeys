import { Principal } from "@dfinity/principal";
import { ActorSubclass, HttpAgent } from "@dfinity/agent";
import { createActor } from "../declarations/ic_vetkeys_encrypted_maps_canister/index";
import { _SERVICE as _DEFAULT_ENCRYPTED_MAPS_SERVICE, AccessRights, ByteBuf, EncryptedMapData } from "../declarations/ic_vetkeys_encrypted_maps_canister/ic_vetkeys_encrypted_maps_canister.did";
import { EncryptedMapsClient } from "./encrypted_maps";

export class DefaultEncryptedMapsClient implements EncryptedMapsClient {
    actor: ActorSubclass<_DEFAULT_ENCRYPTED_MAPS_SERVICE>;

    constructor(agent: HttpAgent, canisterId: string) {
        this.actor = createActor(canisterId, { agent: agent });
    }

    get_accessible_shared_map_names(): Promise<[Principal, ByteBuf][]> {
        return this.actor.get_accessible_shared_map_names();
    }

    get_shared_user_access_for_map(owner: Principal, map_name: ByteBuf): Promise<{ 'Ok': Array<[Principal, AccessRights]> } |
    { 'Err': string }> {
        return this.actor.get_shared_user_access_for_map(owner, map_name);
    }

    get_owned_non_empty_map_names(): Promise<Array<ByteBuf>> {
        return this.actor.get_owned_non_empty_map_names();
    }

    get_all_accessible_encrypted_values(): Promise<[[Principal, ByteBuf], [ByteBuf, ByteBuf][]][]> {
        return this.actor.get_all_accessible_encrypted_values();
    }

    get_all_accessible_encrypted_maps(): Promise<Array<EncryptedMapData>> {
        return this.actor.get_all_accessible_encrypted_maps();
    }

    get_encrypted_value(map_owner: Principal, map_name: ByteBuf, map_key: ByteBuf): Promise<{ 'Ok': [] | [ByteBuf] } |
    { 'Err': string }> {
        return this.actor.get_encrypted_value(map_owner, map_name, map_key);
    }

    get_encrypted_values_for_map(map_owner: Principal, map_name: ByteBuf): Promise<{ 'Ok': Array<[ByteBuf, ByteBuf]> } |
    { 'Err': string }> {
        return this.actor.get_encrypted_values_for_map(map_owner, map_name);
    }

    get_encrypted_vetkey(map_owner: Principal, map_name: ByteBuf, transport_key: ByteBuf): Promise<{ 'Ok': ByteBuf } |
    { 'Err': string }> {
        return this.actor.get_encrypted_vetkey(map_owner, map_name, transport_key);
    }

    insert_encrypted_value(map_owner: Principal, map_name: ByteBuf, map_key: ByteBuf, data: ByteBuf): Promise<{ 'Ok': [] | [ByteBuf] } |
    { 'Err': string }> {
        return this.actor.insert_encrypted_value(map_owner, map_name, map_key, data);
    }

    remove_encrypted_value(map_owner: Principal, map_name: ByteBuf, map_key: ByteBuf): Promise<{ 'Ok': [] | [ByteBuf] } |
    { 'Err': string }> {
        return this.actor.remove_encrypted_value(map_owner, map_name, map_key);
    }

    remove_map_values(map_owner: Principal, map_name: ByteBuf): Promise<{ 'Ok': Array<ByteBuf> } |
    { 'Err': string }> {
        return this.actor.remove_map_values(map_owner, map_name);
    }

    get_vetkey_verification_key(): Promise<ByteBuf> {
        return this.actor.get_vetkey_verification_key();
    }

    set_user_rights(owner: Principal, map_name: ByteBuf, user: Principal, user_rights: AccessRights): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }> {
        return this.actor.set_user_rights(owner, map_name, user, user_rights);
    }

    get_user_rights(owner: Principal, map_name: ByteBuf, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }> {
        return this.actor.get_user_rights(owner, map_name, user);
    }

    remove_user(owner: Principal, map_name: ByteBuf, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }> {
        return this.actor.remove_user(owner, map_name, user);
    }
}
