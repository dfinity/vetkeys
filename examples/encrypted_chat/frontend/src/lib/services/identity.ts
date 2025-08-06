import { AuthClient } from '@dfinity/auth-client';
import type { Identity } from '@dfinity/agent';
import type { User } from '../types';

// Identity service using @dfinity/agent
export class IdentityService {
	private authClient: AuthClient | null = null;
	private currentUser: User | null = null;

	async init(): Promise<void> {
		this.authClient = await AuthClient.create();
		await this.checkAuthentication();
	}

	async checkAuthentication(): Promise<boolean> {
		if (!this.authClient) return false;

		const isAuthenticated = await this.authClient.isAuthenticated();
		if (isAuthenticated) {
			const identity = this.authClient.getIdentity();
			this.currentUser = await this.createUserFromIdentity(identity);
			return true;
		}
		return false;
	}

	async login(): Promise<User | null> {
		if (!this.authClient) return null;

		return new Promise((resolve) => {
			this.authClient!.login({
				onSuccess: async () => {
					const identity = this.authClient!.getIdentity();
					this.currentUser = await this.createUserFromIdentity(identity);
					resolve(this.currentUser);
				},
				onError: () => {
					resolve(null);
				}
			});
		});
	}

	async logout(): Promise<void> {
		if (this.authClient) {
			await this.authClient.logout();
		}
		this.currentUser = null;
	}

	getCurrentUser(): User | null {
		return this.currentUser;
	}

	getIdentity(): Identity | null {
		return this.authClient?.getIdentity() || null;
	}

	private async createUserFromIdentity(identity: Identity): Promise<User> {
		// In a real implementation, you would extract user info from the identity
		// For now, we'll create a dummy user with the principal as the ID
		const principal = identity.getPrincipal();

		return {
			id: principal.toString(),
			name: `User ${principal.toString().slice(0, 8)}...`,
			avatar: '👤',
			isOnline: true
		};
	}

	// Dummy implementation for demo purposes
	async getDummyCurrentUser(): Promise<User> {
		return {
			id: 'current-user',
			name: 'You',
			avatar: '👤',
			isOnline: true
		};
	}
}

export const identityService = new IdentityService();
