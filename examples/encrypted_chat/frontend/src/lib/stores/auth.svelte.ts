import { chatStorageService } from '$lib/services/chatStorage';
import { Actor, HttpAgent, type ActorSubclass } from '@icp-sdk/core/agent';
import { AuthClient } from '@icp-sdk/auth/client';
import type { Principal } from '@icp-sdk/core/principal';
import { idlFactory, type _SERVICE } from '../../declarations/encrypted_chat/backend.did';
import fetch from 'isomorphic-fetch';
import { safeGetCanisterEnv } from '@icp-sdk/core/agent/canister-env';

if (import.meta.env.SSR || typeof window === 'undefined') {
	const {
		indexedDB,
		IDBKeyRange,
		IDBRequest,
		IDBDatabase,
		IDBTransaction,
		IDBCursor,
		IDBIndex,
		IDBObjectStore,
		IDBOpenDBRequest
	} = await import('fake-indexeddb');
	globalThis.indexedDB = indexedDB;
	globalThis.IDBKeyRange = IDBKeyRange;
	globalThis.IDBDatabase = IDBDatabase;
	globalThis.IDBTransaction = IDBTransaction;
	globalThis.IDBRequest = IDBRequest;
	globalThis.IDBCursor = IDBCursor;
	globalThis.IDBIndex = IDBIndex;
	globalThis.IDBObjectStore = IDBObjectStore;
	globalThis.IDBOpenDBRequest = IDBOpenDBRequest;
}

export type AuthState =
	| {
			label: 'initializing-auth';
	  }
	| {
			label: 'anonymous';
			client: AuthClient;
	  }
	| {
			label: 'initialized';
			client: AuthClient;
	  }
	| {
			label: 'error';
			error: string;
	  };

export const auth = $state<{ state: AuthState }>({
	state: { label: 'initializing-auth' }
});

async function initAuth() {
	const client = await AuthClient.create();
	if (await client.isAuthenticated()) {
		auth.state = {
			label: 'initialized',
			client
		};
	} else {
		auth.state = {
			label: 'anonymous',
			client
		};
	}
}

void initAuth();

export async function login() {
	if (auth.state.label === 'anonymous') {
		const client = auth.state.client;
		await client.login({
			maxTimeToLive: BigInt(8 * 3600) * BigInt(1_000_000_000), // 8 hours
			identityProvider:
				window.location.hostname === 'localhost' || window.location.hostname.endsWith('.localhost')
					? 'http://id.ai.localhost:8000/#authorize'
					: 'https://identity.ic0.app/#authorize',
			onSuccess: () => {
				authenticate(client);
			},
			onError: (e) => console.error('Failed to authenticate with internet identity: ' + e)
		});
	}
}

function authenticate(client: AuthClient) {
	auth.state = {
		label: 'initialized',
		client
	};
}

export async function logout() {
	if (auth.state.label === 'initialized') {
		await auth.state.client.logout();
		auth.state = {
			label: 'anonymous',
			client: auth.state.client
		};
		await chatStorageService.discardCacheCompletely();
	}
}

export function getMyPrincipal(): Principal {
	if (auth.state.label !== 'initialized') throw new Error('Unexpectedly not authenticated');
	if (!auth.state.client.getIdentity().getPrincipal()) {
		console.error('Unexpectedly not authenticated: undefined principal', auth.state.client.getIdentity().getPrincipal());
	}
	return auth.state.client.getIdentity().getPrincipal();
}

export function getActor(): ActorSubclass<_SERVICE> {
	if (auth.state.label === 'initialized') {
		const canisterEnv = safeGetCanisterEnv<{ 'PUBLIC_CANISTER_ID:encrypted_chat': string }>();
		const agent = HttpAgent.createSync({
			identity: auth.state.client.getIdentity(),
			fetch: fetch,
			host: window.location.origin,
			...(canisterEnv?.IC_ROOT_KEY ? { rootKey: canisterEnv.IC_ROOT_KEY } : {})
		});
		const canisterId = canisterEnv?.['PUBLIC_CANISTER_ID:encrypted_chat'];
		if (!canisterId) {
			throw new Error('PUBLIC_CANISTER_ID:encrypted_chat is not set');
		}
		return Actor.createActor(idlFactory, { agent, canisterId });
	} else {
		throw new Error('Not authenticated');
	}
}
