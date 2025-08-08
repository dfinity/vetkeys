import { AuthClient } from '@dfinity/auth-client';

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

export type AuthStateWrapper = {
	state: AuthState;
};

export const auth = $state<AuthStateWrapper>({
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
		const client = $state.snapshot(auth.state.client) as AuthClient;
		await client.login({
			maxTimeToLive: BigInt(8 * 3600) * BigInt(1_000_000_000), // 8 hours
			identityProvider:
				globalThis.process.env.DFX_NETWORK === 'ic'
					? 'https://identity.ic0.app/#authorize'
					: `http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8000/#authorize`,
			onSuccess: async () => {
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
	}
}
