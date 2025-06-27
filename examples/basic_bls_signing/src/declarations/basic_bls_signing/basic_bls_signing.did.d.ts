import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface Signature {
  'signature' : Uint8Array | number[],
  'message' : string,
  'timestamp' : bigint,
}
export interface _SERVICE {
  'get_my_signatures' : ActorMethod<[], Array<Signature>>,
  'get_my_verification_key' : ActorMethod<[], Uint8Array | number[]>,
  'sign_message' : ActorMethod<[string], Uint8Array | number[]>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
