import type { Chat, Message, UserConfig, Notification } from '../types';
import { chatAPI } from '../services/api';
import { storageService } from '../services/storage';
import { SvelteDate } from 'svelte/reactivity';
import { auth } from '$lib/stores/auth.svelte';
import { createActor } from '../../declarations/encrypted_chat';
import { HttpAgent, type ActorSubclass } from '@dfinity/agent';
import fetch from 'isomorphic-fetch';
import type { _SERVICE , ChatId, EncryptedMessage, } from '../../declarations/encrypted_chat/encrypted_chat.did';
import { SvelteMap } from 'svelte/reactivity';

export const chats = $state<{ state: Chat[] }>({ state: [] });
export const selectedChatId = $state<{ state: string | null }>({ state: null });
export const userConfig = $state<{ state: UserConfig | null }>({ state: null });
export const notifications = $state<{ state: Notification[] }>({ state: [] });
export const isLoading = $state({ state: false });
export const isBlocked = $state({ state: false });
export const availableChats = $state({ state: [] });
export const messages = new SvelteMap<[ChatId, bigint], EncryptedMessage>(); 

export const chatActions = {
	async initialize() {
		isLoading.state = true;
		try {
			// Load user config
			let config = await storageService.getUserConfig();
			if (!config) {
				config = await storageService.getDefaultUserConfig();
				await storageService.saveUserConfig(config);
			}
			userConfig.state = config;

			// Load chats from API
			const actor = await getActor();
			if (actor) {
				const chatList = await chatAPI.getChatIdsAndCurrentNumbersOfMessages(actor);
				chats.state = chatList;
			}

			// Load messages for each chat from storage and merge with API data
			const messageMap: Record<string, Message[]> = {};
			for (const chat of chatList) {
				// First load from storage
				let chatMessages = await storageService.getMessages(chat.id);

				// If no stored messages, load from API
				if (chatMessages.length === 0) {
					chatMessages = await chatAPI.getChatMessages(chat.id);
					// Save to storage
					for (const message of chatMessages) {
						await storageService.saveMessage(message);
					}
				}

				messageMap[chat.id] = chatMessages;
			}
			messages.state = messageMap;

			// Set up periodic cleanup
			setInterval(() => {
				chatActions.cleanupDisappearingMessages();
			}, 60000);
		} catch (error) {
			console.error('Failed to initialize chat:', error);
			chatActions.addNotification({
				type: 'error',
				title: 'Initialization Error',
				message: 'Failed to load chat data. Please refresh the page.',
				isDismissible: true
			});
		} finally {
			isLoading.state = false;
		}
	},

	async refreshChats() {
		const actor = await getActor();
		if (actor) {
			const chats = await actor.get_my_chat_ids();
			console.log('fetched ' + (await chats).length + ' chats');
		}
	},

	selectChat(chatId: string) {
		selectedChatId.state = chatId;

		// Mark as read
		chats.state = chats.state.map((chat) =>
			chat.id === chatId ? { ...chat, unreadCount: 0 } : chat
		);
	},

	async loadChatMessages(chatId: string) {
		try {
			const chatMessages = await chatAPI.getChatMessages(chatId);

			messages.state = { ...messages.state, [chatId]: chatMessages };

			// Save to storage
			for (const message of chatMessages) {
				await storageService.saveMessage(message);
			}
		} catch (error) {
			console.error('Failed to load messages:', error);
			chatActions.addNotification({
				type: 'error',
				title: 'Load Error',
				message: 'Failed to load messages for this chat.',
				isDismissible: true
			});
		}
	},

	async sendMessage(
		chatId: string,
		content: string,
		fileData?: { name: string; size: number; type: string; data: ArrayBuffer }
	) {
		try {
			// Check if key rotation is needed
			const needsRotation = await chatAPI.checkKeyRotation(chatId);
			if (needsRotation) {
				await chatActions.rotateKeys(chatId);
			}

			const message = await chatAPI.sendMessage(
				chatId,
				content,
				fileData ? 'file' : 'text',
				fileData ? fileData.data : undefined
			);

			// Add to messages
			messages.state = {
				...messages.state,
				[chatId]: [...(messages.state[chatId] || []), message]
			};

			// Update chat last activity
			chats.state = chats.state.map((chat) =>
				chat.id === chatId
					? { ...chat, lastActivity: new SvelteDate(), lastMessage: message }
					: chat
			);

			// Save to storage
			await storageService.saveMessage(message);
		} catch (error) {
			console.error('Failed to send message:', error);
			chatActions.addNotification({
				type: 'error',
				title: 'Send Error',
				message: 'Failed to send message. Please try again.',
				isDismissible: true
			});
		}
	},

	async rotateKeys(chatId: string) {
		try {
			// Mark chat as updating
			chats.state = chats.state.map((chat) =>
				chat.id === chatId ? { ...chat, isUpdating: true } : chat
			);

			const newKeyStatus = await chatAPI.rotateKeys(chatId);

			// Update chat with new key status
			chats.state = chats.state.map((chat) =>
				chat.id === chatId
					? {
							...chat,
							isUpdating: false,
							keyRotationStatus: newKeyStatus,
							ratchetEpoch: newKeyStatus.currentEpoch
						}
					: chat
			);

			chatActions.addNotification({
				type: 'success',
				title: 'Keys Rotated',
				message: 'Chat encryption keys have been successfully rotated.',
				isDismissible: true,
				duration: 3000
			});
		} catch (error) {
			console.error('Failed to rotate keys:', error);

			// Mark chat as not updating
			chats.state = chats.state.map((chat) =>
				chat.id === chatId ? { ...chat, isUpdating: false } : chat
			);

			chatActions.addNotification({
				type: 'error',
				title: 'Key Rotation Failed',
				message: 'Failed to rotate encryption keys. Please try again.',
				isDismissible: true
			});
		}
	},

	async updateUserConfig(config: Partial<UserConfig>) {
		if (!userConfig.state) return;

		const newConfig = { ...userConfig.state, ...config };
		userConfig.state = newConfig;
		await storageService.saveUserConfig(newConfig);

		// Trigger cache cleanup if retention days changed
		if (config.cacheRetentionDays !== undefined) {
			await storageService.cleanupUserCache(config.cacheRetentionDays);
		}
	},

	addNotification(notification: Omit<Notification, 'id'>) {
		const id = `notification-${Date.now()}-${Math.random()}`;
		const newNotification: Notification = { ...notification, id };
		notifications.state = [...notifications.state, newNotification];

		// Auto-dismiss if duration is set
		if (notification.duration) {
			setTimeout(() => {
				chatActions.dismissNotification(id);
			}, notification.duration);
		}
	},

	dismissNotification(id: string) {
		notifications.state = notifications.state.filter((n) => n.id !== id);
	},

	async cleanupDisappearingMessages() {
		for (const chat of chats.state) {
			if (chat.disappearingMessagesDuration > 0) {
				await storageService.cleanupOldMessages(chat.id, chat.disappearingMessagesDuration);
			}
		}
	}
};

async function getActor(): Promise<ActorSubclass<_SERVICE> | undefined> {
	if (auth.state.label === 'initialized') {
		const host = process.env.DFX_NETWORK === 'ic' ? 'https://icp-api.io' : 'http://127.0.0.1:8000';
		const agent = HttpAgent.createSync({
			identity: auth.state.client.getIdentity(),
			fetch,
			host
		});
		if (!process.env.CANISTER_ID_ENCRYPTED_CHAT) {
			throw new Error('CANISTER_ID_ENCRYPTED_CHAT is not set');
		}
		return createActor(process.env.CANISTER_ID_ENCRYPTED_CHAT, { agent });
	} else {
		return undefined;
	}
}

// Initialize on module load (browser only)
if (typeof window !== 'undefined') {
	void chatActions.initialize();
}
