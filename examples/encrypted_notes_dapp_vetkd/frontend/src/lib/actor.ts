import { Actor, HttpAgent, type HttpAgentOptions, type ActorSubclass } from "@icp-sdk/core/agent";
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import {
  idlFactory,
  type _SERVICE,
} from "../declarations/encrypted_notes/encrypted_notes_rust.did";

export type BackendActor = ActorSubclass<_SERVICE>;

const canisterEnv = safeGetCanisterEnv<{
  "PUBLIC_CANISTER_ID:encrypted_notes": string;
}>();

export async function createActor(identity?: HttpAgentOptions['identity']): Promise<BackendActor> {
  const agent = await HttpAgent.create({
    identity,
    host: window.location.origin,
    ...(canisterEnv?.IC_ROOT_KEY ? { rootKey: canisterEnv.IC_ROOT_KEY } : {}),
  });

  const canisterId = canisterEnv?.["PUBLIC_CANISTER_ID:encrypted_notes"];
  if (!canisterId) {
    throw new Error("Canister ID not found. Is the canister deployed?");
  }

  return Actor.createActor<_SERVICE>(idlFactory, {
    agent,
    canisterId,
  });
}
