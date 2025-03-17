import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type AccessRights = { 'Read' : null } |
  { 'ReadWrite' : null } |
  { 'ReadWriteManage' : null };
export interface ByteBuf { 'inner' : Uint8Array | number[] }
export interface PasswordMetadata {
  'url' : string,
  'number_of_modifications' : bigint,
  'tags' : Array<string>,
  'last_modification_date' : bigint,
  'last_modified_principal' : Principal,
  'creation_date' : bigint,
}
export type Result = { 'Ok' : Array<[ByteBuf, ByteBuf, PasswordMetadata]> } |
  { 'Err' : string };
export type Result_1 = { 'Ok' : ByteBuf } |
  { 'Err' : string };
export type Result_2 = { 'Ok' : Array<ByteBuf> } |
  { 'Err' : string };
export type Result_3 = { 'Ok' : Array<[Principal, AccessRights]> } |
  { 'Err' : string };
export type Result_4 = { 'Ok' : [] | [AccessRights] } |
  { 'Err' : string };
export type Result_5 = { 'Ok' : [] | [[ByteBuf, PasswordMetadata]] } |
  { 'Err' : string };
export interface _SERVICE {
  'get_accessible_shared_map_names' : ActorMethod<
    [],
    Array<[Principal, ByteBuf]>
  >,
  'get_encrypted_values_for_map_with_metadata' : ActorMethod<
    [Principal, ByteBuf],
    Result
  >,
  'get_encrypted_vetkey' : ActorMethod<[Principal, ByteBuf, ByteBuf], Result_1>,
  'get_owned_non_empty_map_names' : ActorMethod<[], Result_2>,
  'get_shared_user_access_for_map' : ActorMethod<
    [Principal, ByteBuf],
    Result_3
  >,
  'get_user_rights' : ActorMethod<[Principal, ByteBuf, Principal], Result_4>,
  'get_vetkey_verification_key' : ActorMethod<[], ByteBuf>,
  'insert_encrypted_value_with_metadata' : ActorMethod<
    [Principal, ByteBuf, ByteBuf, ByteBuf, Array<string>, string],
    Result_5
  >,
  'remove_encrypted_value_with_metadata' : ActorMethod<
    [Principal, ByteBuf, ByteBuf],
    Result_5
  >,
  'remove_user' : ActorMethod<[Principal, ByteBuf, Principal], Result_4>,
  'set_user_rights' : ActorMethod<
    [Principal, ByteBuf, Principal, AccessRights],
    Result_4
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
