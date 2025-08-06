import { get, set, del, clear, keys } from 'idb-keyval';
import type { Message, Chat, UserConfig } from '../types';

// IndexedDB storage service for persistent chat data
export class StorageService {
	private readonly MESSAGE_PREFIX = 'msg_';
	private readonly CHAT_PREFIX = 'chat_';
	private readonly CONFIG_KEY = 'user_config';
	private readonly DISCLAIMER_KEY = 'disclaimer_dismissed';

	// Message storage
	async saveMessage(message: Message): Promise<void> {
		const key = `${this.MESSAGE_PREFIX}${message.chatId}_${message.id}`;
		await set(key, message);
	}

	async getMessages(chatId: string): Promise<Message[]> {
		const allKeys = await keys();
		const chatMessageKeys = allKeys.filter(
			(key) => typeof key === 'string' && key.startsWith(`${this.MESSAGE_PREFIX}${chatId}_`)
		);

		const messages: Message[] = [];
		for (const key of chatMessageKeys) {
			const message = await get(key);
			if (message) {
				// Ensure timestamp is a Date object
				if (typeof message.timestamp === 'string') {
					message.timestamp = new Date(message.timestamp);
				}
				messages.push(message);
			}
		}

		// Sort by timestamp
		return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	}

	async deleteMessage(chatId: string, messageId: string): Promise<void> {
		const key = `${this.MESSAGE_PREFIX}${chatId}_${messageId}`;
		await del(key);
	}

	// Clean up old messages based on disappearing messages setting
	async cleanupOldMessages(chatId: string, retentionDays: number): Promise<void> {
		if (retentionDays === 0) return; // Never delete if 0

		const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
		const messages = await this.getMessages(chatId);

		for (const message of messages) {
			if (message.timestamp < cutoffDate) {
				await this.deleteMessage(chatId, message.id);
			}
		}
	}

	// Chat metadata storage
	async saveChat(chat: Chat): Promise<void> {
		const key = `${this.CHAT_PREFIX}${chat.id}`;
		await set(key, chat);
	}

	async getChat(chatId: string): Promise<Chat | null> {
		const key = `${this.CHAT_PREFIX}${chatId}`;
		return (await get(key)) || null;
	}

	async getAllChats(): Promise<Chat[]> {
		const allKeys = await keys();
		const chatKeys = allKeys.filter(
			(key) => typeof key === 'string' && key.startsWith(this.CHAT_PREFIX)
		);

		const chats: Chat[] = [];
		for (const key of chatKeys) {
			const chat = await get(key);
			if (chat) {
				chats.push(chat);
			}
		}

		return chats.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
	}

	// User configuration
	async saveUserConfig(config: UserConfig): Promise<void> {
		await set(this.CONFIG_KEY, config);
	}

	async getUserConfig(): Promise<UserConfig | null> {
		return (await get(this.CONFIG_KEY)) || null;
	}

	async getDefaultUserConfig(): Promise<UserConfig> {
		return {
			cacheRetentionDays: 7,
			userId: 'current-user',
			userName: 'You',
			userAvatar: '👤'
		};
	}

	// Disclaimer
	async setDisclaimerDismissed(): Promise<void> {
		await set(this.DISCLAIMER_KEY, true);
	}

	async isDisclaimerDismissed(): Promise<boolean> {
		return (await get(this.DISCLAIMER_KEY)) || false;
	}

	// Cache cleanup based on user config
	async cleanupUserCache(retentionDays: number): Promise<void> {
		const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
		const allKeys = await keys();

		// Clean up old message keys
		for (const key of allKeys) {
			if (typeof key === 'string' && key.startsWith(this.MESSAGE_PREFIX)) {
				const message = await get(key);
				if (message && new Date(message.timestamp) < cutoffDate) {
					await del(key);
				}
			}
		}
	}

	// Clear all data (for testing/reset)
	async clearAllData(): Promise<void> {
		await clear();
	}
}

export const storageService = new StorageService();
