import { get, set, del, clear, keys } from 'idb-keyval';
import type { Message, Chat, UserConfig } from '../types';
import { chatIdToString } from '$lib/utils';

// IndexedDB storage service for persistent chat data
export class StorageService {
	private readonly MESSAGE_PREFIX = 'messages';
	private readonly VETKEY_EPOCH_KEY_PREFIX = 'vetkey_epoch_key';
	private readonly CONFIG_KEY = 'user_config';
	private readonly DISCLAIMER_KEY = 'disclaimer_dismissed';
	private readonly CHAT_PREFIX = 'chat_';

	// Message storage
	async saveMessage(message: Message): Promise<void> {
		await set([this.MESSAGE_PREFIX, message.chatId, message.id], message);
	}

	async getMessages(chatId: string): Promise<Message[]> {
		const allKeys = await keys();
		const chatMessageKeys = allKeys.filter(
			(key) => typeof key === 'string' && key.startsWith(`${this.MESSAGE_PREFIX}${chatId}_`)
		);

		const messages: Message[] = [];
		for (const key of chatMessageKeys) {
			const message = (await get(key)) as Message;
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

	// Chat metadata storage
	async saveChat(chat: Chat): Promise<void> {
		const key = `${this.CHAT_PREFIX}${chatIdToString(chat.id)}`;
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
			const chat = (await get(key)) as Chat;
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

	getMyUserConfig(): UserConfig {
		return {
			cacheRetentionDays: 7,
			userId: 'Me',
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
				const message = (await get(key)) as Message;
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
