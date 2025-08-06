import { writable, derived, get } from 'svelte/store';
import type { Chat, Message, User, UserConfig, Notification } from '../types';
import { chatAPI } from '../services/api';
import { storageService } from '../services/storage';
import { identityService } from '../services/identity';

// Chat stores
export const chats = writable<Chat[]>([]);
export const selectedChatId = writable<string | null>(null);
export const messages = writable<{ [chatId: string]: Message[] }>({});
export const currentUser = writable<User | null>(null);
export const userConfig = writable<UserConfig | null>(null);
export const notifications = writable<Notification[]>([]);
export const isLoading = writable(false);

// Derived stores
export const selectedChat = derived([chats, selectedChatId], ([$chats, $selectedChatId]) => {
	if (!$selectedChatId) return null;
	return $chats.find((chat) => chat.id === $selectedChatId) || null;
});

export const selectedChatMessages = derived(
	[messages, selectedChatId],
	([$messages, $selectedChatId]) => {
		if (!$selectedChatId) return [];
		return $messages[$selectedChatId] || [];
	}
);

export const unreadMessageCount = derived(chats, ($chats) =>
	$chats.reduce((total, chat) => total + chat.unreadCount, 0)
);

// Chat actions
export const chatActions = {
	async initialize() {
		isLoading.set(true);
		try {
			// Initialize identity service
			await identityService.init();

			// Load user config
			let config = await storageService.getUserConfig();
			if (!config) {
				config = await storageService.getDefaultUserConfig();
				await storageService.saveUserConfig(config);
			}
			userConfig.set(config);

			// Set current user (dummy for now)
			const user = await identityService.getDummyCurrentUser();
			currentUser.set(user);

			// Load chats from API
			const chatList = await chatAPI.getChats();
			chats.set(chatList);

			// Load messages for each chat from storage and merge with API data
			const messageMap: { [chatId: string]: Message[] } = {};
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
			messages.set(messageMap);

			// Set up periodic cleanup
			setInterval(() => {
				chatActions.cleanupDisappearingMessages();
			}, 60000); // Check every minute
		} catch (error) {
			console.error('Failed to initialize chat:', error);
			chatActions.addNotification({
				type: 'error',
				title: 'Initialization Error',
				message: 'Failed to load chat data. Please refresh the page.',
				isDismissible: true
			});
		} finally {
			isLoading.set(false);
		}
	},

	selectChat(chatId: string) {
		selectedChatId.set(chatId);

		// Mark as read
		chats.update(($chats) =>
			$chats.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat))
		);
	},

	async loadChatMessages(chatId: string) {
		try {
			const chatMessages = await chatAPI.getChatMessages(chatId);

			messages.update(($messages) => ({
				...$messages,
				[chatId]: chatMessages
			}));

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
				fileData
			);

			// Add to messages
			messages.update(($messages) => ({
				...$messages,
				[chatId]: [...($messages[chatId] || []), message]
			}));

			// Update chat last activity
			chats.update(($chats) =>
				$chats.map((chat) =>
					chat.id === chatId ? { ...chat, lastActivity: new Date(), lastMessage: message } : chat
				)
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
			chats.update(($chats) =>
				$chats.map((chat) => (chat.id === chatId ? { ...chat, isUpdating: true } : chat))
			);

			const newKeyStatus = await chatAPI.rotateKeys(chatId);

			// Update chat with new key status
			chats.update(($chats) =>
				$chats.map((chat) =>
					chat.id === chatId
						? {
								...chat,
								isUpdating: false,
								keyRotationStatus: newKeyStatus,
								ratchetEpoch: newKeyStatus.currentEpoch
							}
						: chat
				)
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
			chats.update(($chats) =>
				$chats.map((chat) => (chat.id === chatId ? { ...chat, isUpdating: false } : chat))
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
		const currentConfig = get(userConfig);
		if (!currentConfig) return;

		const newConfig = { ...currentConfig, ...config };
		userConfig.set(newConfig);
		await storageService.saveUserConfig(newConfig);

		// Trigger cache cleanup if retention days changed
		if (config.cacheRetentionDays !== undefined) {
			await storageService.cleanupUserCache(config.cacheRetentionDays);
		}
	},

	addNotification(notification: Omit<Notification, 'id'>) {
		const id = `notification-${Date.now()}-${Math.random()}`;
		const newNotification: Notification = { ...notification, id };

		notifications.update(($notifications) => [...$notifications, newNotification]);

		// Auto-dismiss if duration is set
		if (notification.duration) {
			setTimeout(() => {
				chatActions.dismissNotification(id);
			}, notification.duration);
		}
	},

	dismissNotification(id: string) {
		notifications.update(($notifications) => $notifications.filter((n) => n.id !== id));
	},

	async cleanupDisappearingMessages() {
		const $chats = get(chats);

		for (const chat of $chats) {
			if (chat.disappearingMessagesDuration > 0) {
				await storageService.cleanupOldMessages(chat.id, chat.disappearingMessagesDuration);
			}
		}
	}
};

// Initialize on module load
if (typeof window !== 'undefined') {
	chatActions.initialize();
}
