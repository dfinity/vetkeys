import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface ClosedLotsResponse {
  'bids' : Array<Array<[Principal, bigint]>>,
  'lots' : Array<LotInformation>,
}
export interface LotInformation {
  'id' : bigint,
  'status' : LotStatus,
  'creator' : Principal,
  'name' : string,
  'description' : string,
  'end_time' : bigint,
  'start_time' : bigint,
}
export type LotStatus = { 'Open' : null } |
  { 'ClosedWithWinner' : Principal } |
  { 'ClosedNoBids' : null };
export interface OpenLotsResponse {
  'lots' : Array<LotInformation>,
  'bidders' : Array<Array<Principal>>,
}
export type Result = { 'Ok' : bigint } |
  { 'Err' : string };
export type Result_1 = { 'Ok' : null } |
  { 'Err' : string };
export interface _SERVICE {
  'create_lot' : ActorMethod<[string, string, number], Result>,
  'get_lots' : ActorMethod<[], [OpenLotsResponse, ClosedLotsResponse]>,
  'get_root_ibe_public_key' : ActorMethod<[], Uint8Array | number[]>,
  'place_bid' : ActorMethod<[bigint, Uint8Array | number[]], Result_1>,
  'start_with_interval_secs' : ActorMethod<[bigint], undefined>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
