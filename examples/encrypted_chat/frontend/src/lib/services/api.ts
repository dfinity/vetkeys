import type { Chat, Message, KeyRotationStatus, RatchetStats } from '../types';

// Dummy API service that simulates backend calls
// In real implementation, these would make actual API calls to the backend

export class ChatAPI {
	// Simulate network delay
	private async delay(ms: number = 300): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async getChats(): Promise<Chat[]> {
		await this.delay();
		return [
			{
				id: 'direct-1',
				name: 'Alice Johnson',
				type: 'direct',
				participants: [
					{
						id: 'user-alice',
						name: 'Alice Johnson',
						isOnline: true,
						avatar: '👩‍💼'
					}
				],
				lastActivity: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
				isReady: true,
				isUpdating: false,
				disappearingMessagesDuration: 7,
				keyRotationStatus: {
					lastRotation: new Date(Date.now() - 1000 * 60 * 60 * 12), // 12 hours ago
					nextRotation: new Date(Date.now() + 1000 * 60 * 60 * 12), // 12 hours from now
					isRotationNeeded: false,
					currentEpoch: 15
				},
				ratchetEpoch: 15,
				unreadCount: 2,
				lastMessage: {
					id: 'msg-1',
					chatId: 'direct-1',
					senderId: 'user-alice',
					content: 'Hey! How are you doing?',
					timestamp: new Date(Date.now() - 1000 * 60 * 30),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 15
				}
			},
			{
				id: 'direct-2',
				name: 'Bob Smith',
				type: 'direct',
				participants: [
					{
						id: 'user-bob',
						name: 'Bob Smith',
						isOnline: false,
						lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
						avatar: '👨‍💻'
					}
				],
				lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
				isReady: true,
				isUpdating: false,
				disappearingMessagesDuration: 30,
				keyRotationStatus: {
					lastRotation: new Date(Date.now() - 1000 * 60 * 60 * 18),
					nextRotation: new Date(Date.now() + 1000 * 60 * 60 * 6),
					isRotationNeeded: true,
					currentEpoch: 8
				},
				ratchetEpoch: 8,
				unreadCount: 0,
				lastMessage: {
					id: 'msg-2',
					chatId: 'direct-2',
					senderId: 'current-user',
					content: 'Thanks for the help earlier!',
					timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 8
				}
			},
			{
				id: 'group-1',
				name: 'Project Team',
				type: 'group',
				participants: [
					{
						id: 'user-alice',
						name: 'Alice Johnson',
						isOnline: true,
						avatar: '👩‍💼'
					},
					{
						id: 'user-charlie',
						name: 'Charlie Davis',
						isOnline: true,
						avatar: '👨‍🎨'
					},
					{
						id: 'user-diana',
						name: 'Diana Wilson',
						isOnline: false,
						lastSeen: new Date(Date.now() - 1000 * 60 * 45),
						avatar: '👩‍🔬'
					}
				],
				lastActivity: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
				isReady: true,
				isUpdating: false,
				disappearingMessagesDuration: 14,
				keyRotationStatus: {
					lastRotation: new Date(Date.now() - 1000 * 60 * 60 * 6),
					nextRotation: new Date(Date.now() + 1000 * 60 * 60 * 18),
					isRotationNeeded: false,
					currentEpoch: 23
				},
				ratchetEpoch: 23,
				unreadCount: 5,
				avatar: '🏢',
				lastMessage: {
					id: 'msg-3',
					chatId: 'group-1',
					senderId: 'user-charlie',
					content: 'Meeting at 3 PM today?',
					timestamp: new Date(Date.now() - 1000 * 60 * 15),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 23
				}
			},
			{
				id: 'group-2',
				name: 'Friends Chat',
				type: 'group',
				participants: [
					{
						id: 'user-bob',
						name: 'Bob Smith',
						isOnline: false,
						lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 2),
						avatar: '👨‍💻'
					},
					{
						id: 'user-eve',
						name: 'Eve Martinez',
						isOnline: true,
						avatar: '👩‍🎭'
					}
				],
				lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
				isReady: false,
				isUpdating: true,
				disappearingMessagesDuration: 1,
				keyRotationStatus: {
					lastRotation: new Date(Date.now() - 1000 * 60 * 60 * 24),
					nextRotation: new Date(Date.now() + 1000 * 60 * 60),
					isRotationNeeded: true,
					currentEpoch: 5
				},
				ratchetEpoch: 5,
				unreadCount: 0,
				avatar: '🎉'
			}
		];
	}

	async getChatMessages(chatId: string): Promise<Message[]> {
		await this.delay();

		// Return different message sets based on chat ID
		if (chatId === 'direct-1') {
			return [
				{
					id: 'msg-d1-1',
					chatId: 'direct-1',
					senderId: 'user-alice',
					content: 'Hello! How are you today?',
					timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 15
				},
				{
					id: 'msg-d1-2',
					chatId: 'direct-1',
					senderId: 'current-user',
					content: "Hey Alice! I'm doing great, thanks for asking. How about you?",
					timestamp: new Date(Date.now() - 1000 * 60 * 45),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 15
				},
				{
					id: 'msg-d1-3',
					chatId: 'direct-1',
					senderId: 'user-alice',
					content: "I'm fantastic! Working on some exciting new features 🚀",
					timestamp: new Date(Date.now() - 1000 * 60 * 30),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 15
				}
			];
		}

		if (chatId === 'group-1') {
			return [
				{
					id: 'msg-g1-1',
					chatId: 'group-1',
					senderId: 'user-alice',
					content: "Team, let's discuss the project timeline",
					timestamp: new Date(Date.now() - 1000 * 60 * 60),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 23
				},
				{
					id: 'msg-g1-2',
					chatId: 'group-1',
					senderId: 'user-charlie',
					content: 'Sure! I think we can finish the UI by Friday',
					timestamp: new Date(Date.now() - 1000 * 60 * 45),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 23
				},
				{
					id: 'msg-g1-3',
					chatId: 'group-1',
					senderId: 'current-user',
					content: "Great! I'll have the backend ready by then too",
					timestamp: new Date(Date.now() - 1000 * 60 * 30),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 23
				},
				{
					id: 'msg-g1-4',
					chatId: 'group-1',
					senderId: 'user-charlie',
					content: 'Meeting at 3 PM today?',
					timestamp: new Date(Date.now() - 1000 * 60 * 15),
					type: 'text',
					isEncrypted: true,
					ratchetEpoch: 23
				}
			];
		}

		return [];
	}

	async sendMessage(
		chatId: string,
		content: string,
		type: 'text' | 'file' = 'text',
		fileData?: ArrayBuffer
	): Promise<Message> {
		await this.delay(500);

		const message: Message = {
			id: `msg-${Date.now()}`,
			chatId,
			senderId: 'current-user',
			content,
			timestamp: new Date(),
			type,
			fileData,
			isEncrypted: true,
			ratchetEpoch: Math.floor(Math.random() * 30) + 1
		};

		return message;
	}

	async checkKeyRotation(_chatId: string): Promise<boolean> {
		await this.delay(200);
		// Simulate some chats needing rotation
		return _chatId === 'direct-2' || _chatId === 'group-2';
	}

	async rotateKeys(chatId: string): Promise<KeyRotationStatus> {
		// TODO: Implement actual key rotation
		if (chatId === 'direct-2') {
			await this.delay(1000);
		}
		await this.delay(1000);

		return {
			lastRotation: new Date(),
			nextRotation: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours from now
			isRotationNeeded: false,
			currentEpoch: Math.floor(Math.random() * 50) + 1
		};
	}

	async getRatchetStats(): Promise<RatchetStats> {
		await this.delay(150);

		return {
			currentEpoch: Math.floor(Math.random() * 30) + 1,
			messagesInCurrentEpoch: Math.floor(Math.random() * 50) + 1,
			lastRotation: new Date(Date.now() - 1000 * 60 * 60 * Math.random() * 24),
			nextScheduledRotation: new Date(Date.now() + 1000 * 60 * 60 * Math.random() * 24)
		};
	}

	async updateGroupMembers(
		chatId: string,
		addUsers: string[],
		removeUsers: string[],
		allowHistoryForNew: boolean
	): Promise<boolean> {
		await this.delay(800);
		console.log(
			`Group ${chatId} updated: +${addUsers.length}, -${removeUsers.length}, history: ${allowHistoryForNew}`
		);
		return true;
	}
}

export const chatAPI = new ChatAPI();
