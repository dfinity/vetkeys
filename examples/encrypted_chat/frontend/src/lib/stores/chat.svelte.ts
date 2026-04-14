import {
	type Chat,
	type Message,
	type UserConfig,
	type Notification,
	type SymmetricRatchetStats
} from '../types';
import { canisterAPI } from '../services/canisterApi';
import { chatStorageService } from '../services/chatStorage';
import { SvelteDate } from 'svelte/reactivity';
import { auth, getActor, getMyPrincipal } from '$lib/stores/auth.svelte';
import type {
	ChatId,
	GroupModification
} from '../../declarations/encrypted_chat/backend.did';
import { Principal } from '@icp-sdk/core/principal';
import { chatIdFromString, chatIdToString } from '$lib/utils';
import { EncryptedMessagingService } from '$lib/services/encryptedMessagingService';
import * as cbor from 'cbor-x';
import { KeyStorageService } from '$lib/services/keyStorage';

export const chats = $state<{ state: Chat[] }>({ state: [] });
export const selectedChatId = $state<{ state: ChatId | null }>({ state: null });
export const userConfig = $state<{ state: UserConfig | null }>({ state: null });
export const notifications = $state<{ state: Notification[] }>({ state: [] });
export const isLoading = $state({ state: false });
export const isBlocked = $state({ state: false });
export const availableChats = $state({ state: [] });
export const messages = $state<{ state: Record<string, Message[]> }>({ state: {} });

// Each call to initialize() gets its own generation number. Callbacks and
// async continuations check this to ensure they belong to the current session
// and not a previous one that was superseded by a logout/re-login.
let currentGeneration = 0;
let encryptedMessagingService = new EncryptedMessagingService();

function resetInMemoryState() {
	currentGeneration++;
	// Stop the old worker. Its in-flight async ops will continue running, but
	// they hold references to the OLD instance's maps — not the new one below.
	encryptedMessagingService.signalStopWorker();
	// Replace with a fresh instance. Old instance becomes inert and is GC'd.
	encryptedMessagingService = new EncryptedMessagingService();
	chats.state = [];
	messages.state = {};
	selectedChatId.state = null;
	userConfig.state = null;
	notifications.state = [];
}

export function initVetKeyReactions() {
	$effect.root(() => {
		// Re-initialize when the user logs in (including after switching identities).
		// previousLabel is a plain variable (not $state) so writes don't trigger reactivity.
		let previousLabel = '';
		$effect(() => {
			const currentLabel = auth.state.label;
			if (currentLabel === 'initialized' && previousLabel !== 'initialized') {
				void chatUIActions.initialize();
			}
			previousLabel = currentLabel;
		});

		$effect(() => {
			console.log('Running chat saver $effect...');
			if (auth.state.label !== 'initialized') return;

			for (const chat of chats.state) {
				chatStorageService.saveChat(chat).catch((error) => {
					console.error('Failed to save chat:', error);
				});
			}

			for (const [chatIdStr, messagesArray] of Object.entries(messages.state)) {
				for (const message of messagesArray) {
					// Never persist placeholder messages — they are shown in the UI but
					// omitted from storage so the next session retries decryption.
					if (message.decryptionFailed) continue;
					void chatStorageService.containsMessage(chatIdStr, message.messageId).then((exists) => {
						if (!exists) {
							chatStorageService.saveMessage(message).catch((error) => {
								console.error('Failed to save message:', error);
							});
						}
					});
				}
			}
		});
	});
}

export const chatUIActions = {
	async initialize() {
		console.log('chatActions.initialize');
		resetInMemoryState();
		// Capture this call's generation and service instance. If another
		// initialize() call races us (e.g. auth state flickering), these let
		// us detect the conflict and bail out cleanly.
		const myGeneration = currentGeneration;
		const myService = encryptedMessagingService;
		isLoading.state = true;

		try {
			// Load user config
			let config = await chatStorageService.getUserConfig();
			if (!config) {
				config = chatStorageService.getMyUserConfig();
				await chatStorageService.saveUserConfig(config);
			}
			userConfig.state = config;

			// Load chats
			const allChats = await chatStorageService.getAllChats();

			console.log('initialize: allChats', allChats);

			const allMessages: Record<string, Message[]> = {};
			// Load messages
			for (const chat of allChats) {
				const chatMessages = await chatStorageService.getMessages(chat.idStr);
				console.log(
					'initialize: adding ',
					chatMessages.length,
					' messages from indexedDB for chat ',
					chat.idStr
				);
				if (chatMessages.length !== 0) {
					// Use myService so a concurrent initialize() can't redirect these
					// calls to the newer instance it just created.
					myService.skipMessagesAvailableLocally(
						chatIdFromString(chat.idStr),
						BigInt(chatMessages[chatMessages.length - 1].messageId) + 1n
					);
				}
				allMessages[chat.idStr] = [...(allMessages[chat.idStr] ?? []), ...chatMessages];
			}

			// set the last message for each chat
			allChats.forEach((chat) => {
				const lastMessage = allMessages[chat.idStr][allMessages[chat.idStr].length - 1];
				chat.lastMessage = lastMessage;
			});
			console.log('initialize: allMessages', allMessages);
			console.log('initialize: allChats', allChats);

			const symmetricRatchetStates = await new KeyStorageService().getAllSymmetricRatchetStates();
			for (const { chatIdStr, vetKeyEpoch, state } of symmetricRatchetStates) {
				console.log(
					'initialize: inducting symmetric ratchet state for chatId',
					chatIdStr,
					'vetKeyEpoch',
					vetKeyEpoch,
					'symmetricRatchetState',
					state
				);
				myService.inductSymmetricRatchetState(chatIdStr, vetKeyEpoch, state);
			}

			// Bail before touching shared Svelte state or starting the worker if
			// another initialize() has already taken over.
			if (currentGeneration !== myGeneration) {
				console.log('initialize: superseded by newer initialize(), aborting');
				return;
			}

			chats.state = allChats;
			messages.state = allMessages;

			myService.start(
				(chatIdStr, newMessages) => {
					// Generation guard: discard callbacks from a superseded session.
					// This prevents a previous identity's decrypted messages from
					// appearing in the current identity's UI.
					if (currentGeneration !== myGeneration) return;
					void chatUIActions.onMessagesDecrypted(chatIdStr, newMessages);
				},
				(chatId) => {
					if (currentGeneration !== myGeneration) return;
					void chatUIActions.onNewChatDiscovered(chatId);
				}
			);

			// Wait for the first poll to complete so the chat list is populated
			// before we clear the loading screen.
			await myService.firstPollComplete;

			// Set up periodic cleanup
			//setInterval(() => {
			// TODO: cleanup disappearing messages
			//	}, 60000);
		} catch (error) {
			console.error('Failed to initialize chat:', error);
			if (currentGeneration === myGeneration) {
				chatUIActions.addNotification({
					type: 'error',
					title: 'Initialization Error',
					message: 'Failed to load chat data. Please refresh the page.',
					isDismissible: true
				});
			}
		} finally {
			if (currentGeneration === myGeneration) {
				isLoading.state = false;
			}
		}
	},

	async refreshChats() {
		console.log('refreshChats');
		// Use the canister as the authoritative source for which chats exist.
		// This is independent of the background worker's key induction state, so
		// chats appear in the UI immediately after login rather than waiting for
		// the first background-worker poll cycle to complete.
		const canisterChats = await canisterAPI.getChatIdsAndCurrentNumbersOfMessages(await getActor());
		const currentChatIds = canisterChats.map(({ chatId }) => chatId);

		const chatsToRemoveFromUi = chats.state.filter(
			(c) => !currentChatIds.find((chatId) => chatIdToString(chatId) === c.idStr)
		);
		if (chatsToRemoveFromUi.length > 0) {
			console.log(
				'refreshChats: removing chats ',
				chatsToRemoveFromUi.map((c) => c.idStr),
				' from chats.state'
			);
		}

		const chatsToAddToUi = currentChatIds.filter(
			(chatId) => !chats.state.find((chat) => chat.idStr === chatIdToString(chatId))
		);

		const vetKeyEpochMetaData = [];

		for (const chatId of chatsToAddToUi) {
			const chatIdStr = chatIdToString(chatId);
			console.log('refreshChats: adding chat ', chatIdStr);
			vetKeyEpochMetaData.push(await canisterAPI.getLatestVetKeyEpochMetadata(await getActor(), chatId));
		}

		const newChats: Chat[] = [];

		for (let i = 0; i < chatsToAddToUi.length; i++) {
			const chatId = chatsToAddToUi[i];
			const chatIdStr = chatIdToString(chatId);
			console.log('refreshChats: adding chat ', chatIdStr);

			if (chats.state.find((c) => c.idStr === chatIdStr)) {
				continue;
			}

			const isGroup = 'Group' in chatId;

			const participants = vetKeyEpochMetaData[i].participants;
			if (!participants) {
				console.error('Failed to get participants for chat:', chatId);
				continue;
			}
			const myPrincipalText = getMyPrincipal().toText();
			const name = isGroup
				? `Group: ${shortenId(String(chatId.Group.toString()))}`
				: participants[0].toText() === participants[1].toText()
					? 'Note to Self'
					: `Direct: ${participants.find((p) => p.toText() !== myPrincipalText)?.toText()}`;
			const now = new SvelteDate();

			const chat: Chat = {
				idStr: chatIdStr,
				name,
				type: isGroup ? 'group' : 'direct',
				participants: participants.map((p) => ({
					principal: p,
					name: myPrincipalText === p.toText() ? 'Me' : p.toText(),
					avatar: '👤',
					isOnline: true
				})),
				lastMessage: undefined,
				lastActivity: now,
				isReady: true,
				isUpdating: false,
				disappearingMessagesDuration: 0,
				keyRotationStatus: buildDummyRotationStatus(),
				vetKeyEpoch: Number(vetKeyEpochMetaData[i].epoch_id),
				symmetricRatchetEpoch: 0,
				unreadCount: 0,
				avatar: isGroup ? '👥' : '👤'
			};
			newChats.push(chat);
		}

		chats.state = [
			...chats.state.filter((c) =>
				currentChatIds.find((chatId) => chatIdToString(chatId) === c.idStr)
			),
			...newChats.filter((c) => !chats.state.find((c2) => c2.idStr === c.idStr))
		];

		// Initialize empty messages cache; we lazy-load on demand
		for (const chat of newChats) {
			if (!messages.state[chat.idStr]) messages.state[chat.idStr] = [];
		}

		if (chatsToRemoveFromUi.length > 0) {
			for (const chat of chatsToRemoveFromUi) {
				await chatStorageService.deleteChat(chat.idStr);
			}
		}
	},

	selectChat(chatId: ChatId) {
		selectedChatId.state = chatId;
		console.log('selectChat: selected chat ', chatIdToString(chatId));

		// Mark as read
		const index = chats.state.findIndex((c) => c.idStr === chatIdToString(chatId));
		if (index >= 0) {
			chats.state[index].unreadCount = 0;
		} else {
			console.error('selectChat: chat not found: ', chatIdToString(chatId));
		}
	},

	// Called by the background worker as soon as messages are decrypted — no polling needed.
	async onMessagesDecrypted(chatIdStr: string, newMessages: Message[]) {
		const chat = chats.state.find((c) => c.idStr === chatIdStr);
		if (!chat) {
			console.error('Bug in onMessagesDecrypted: chat not found: ', chatIdStr);
			return;
		}

		// Drop any messages whose ID is already present in the UI (defense-in-depth
		// deduplication — the service should not deliver duplicates, but guard anyway).
		const existingIds = new Set((messages.state[chatIdStr] ?? []).map((m) => m.messageId));
		const freshMessages = newMessages.filter((m) => !existingIds.has(m.messageId));
		if (freshMessages.length === 0) return;

		// Persist to IndexedDB — but not placeholder messages. Placeholders are
		// omitted so that the next session retries decryption.
		for (const m of freshMessages) {
			if (!m.decryptionFailed) await chatStorageService.saveMessage(m);
		}

		messages.state = {
			...messages.state,
			[chatIdStr]: [...(messages.state[chatIdStr] ?? []), ...freshMessages]
		};

		const isCurrentlySelected =
			selectedChatId.state && chatIdToString(selectedChatId.state) === chatIdStr;

		chats.state = chats.state.map((c) =>
			c.idStr === chatIdStr
				? {
						...c,
						unreadCount: isCurrentlySelected ? 0 : c.unreadCount + freshMessages.length,
						lastMessage: freshMessages[freshMessages.length - 1]
					}
				: c
		);
	},

	// Called by the background worker when it discovers a chat not previously seen.
	async onNewChatDiscovered(_chatId: ChatId) {
		await chatUIActions.refreshChats();
	},

	enqueueEncryptAndSendMessage(
		chatId: ChatId,
		textContent: string,
		fileData?: { name: string; size: number; type: string; data: ArrayBuffer }
	) {
		const messageContent = cbor.encode({ textContent, fileData }) as Uint8Array;
		encryptedMessagingService.enqueueSendMessage(chatId, messageContent);
	},

	rotateKeys(chatId: string) {
		try {
			// Mark chat as updating
			chats.state = chats.state.map((chat) =>
				chat.idStr === chatId ? { ...chat, isUpdating: true } : chat
			);

			const stats: SymmetricRatchetStats = canisterAPI.getRatchetStats();

			// Update chat with new key status (dummy update)
			chats.state = chats.state.map((chat) =>
				chat.idStr === chatId
					? {
							...chat,
							isUpdating: false,
							keyRotationStatus: {
								lastRotation: stats.lastRotation,
								nextRotation: stats.nextScheduledRotation,
								isRotationNeeded: false,
								currentEpoch: stats.currentEpoch
							},
							ratchetEpoch: stats.currentEpoch
						}
					: chat
			);

			chatUIActions.addNotification({
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
				chat.idStr === chatId ? { ...chat, isUpdating: false } : chat
			);

			chatUIActions.addNotification({
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
		await chatStorageService.saveUserConfig(newConfig);

		// Trigger cache cleanup if retention days changed
		if (config.cacheRetentionDays !== undefined) {
			await chatStorageService.cleanupUserCache(config.cacheRetentionDays);
		}
	},

	addNotification(notification: Omit<Notification, 'id'>) {
		const id = `notification-${Date.now()}-${Math.random()}`;
		const newNotification: Notification = { ...notification, id };
		notifications.state = [...notifications.state, newNotification];

		// Auto-dismiss if duration is set
		if (notification.duration) {
			setTimeout(() => {
				chatUIActions.dismissNotification(id);
			}, notification.duration);
		}
	},

	dismissNotification(id: string) {
		notifications.state = notifications.state.filter((n) => n.id !== id);
	},

	async createDirectChat(
		receiverPrincipalText: string,
		rotationMinutes: number,
		expirationMinutes: number
	) {
		try {
			const receiver = Principal.fromText(receiverPrincipalText.trim());
			await canisterAPI.createDirectChat(
				await getActor(),
				receiver,
				BigInt(Math.max(0, Math.trunc(rotationMinutes))),
				BigInt(Math.max(0, Math.trunc(expirationMinutes)))
			);
			chatUIActions.addNotification({
				type: 'success',
				title: 'Chat Created',
				message: 'Direct chat created successfully.',
				isDismissible: true,
				duration: 3000
			});
			await chatUIActions.refreshChats();
		} catch (error) {
			console.error('Failed to create direct chat:', error);
			chatUIActions.addNotification({
				type: 'error',
				title: 'Create Chat Failed',
				message: 'Failed to create direct chat. Check the Principal and try again.',
				isDismissible: true
			});
		}
	},

	async createGroupChat(
		participantPrincipalTexts: string[],
		rotationMinutes: number,
		expirationMinutes: number
	) {
		try {
			const participants = participantPrincipalTexts
				.map((t) => t.trim())
				.filter(Boolean)
				.map((t) => Principal.fromText(t));
			const meta = await canisterAPI.createGroupChat(
				await getActor(),
				participants,
				BigInt(Math.max(0, Math.trunc(rotationMinutes))),
				BigInt(Math.max(0, Math.trunc(expirationMinutes)))
			);
			chatUIActions.addNotification({
				type: 'success',
				title: 'Group Created',
				message: `Group chat #${meta.chat_id.toString()} created successfully.`,
				isDismissible: true,
				duration: 3000
			});
			await chatUIActions.refreshChats();
		} catch (error) {
			console.error('Failed to create group chat:', error);
			chatUIActions.addNotification({
				type: 'error',
				title: 'Create Group Failed',
				message: 'Failed to create group chat. Check the Principals and try again.',
				isDismissible: true
			});
		}
	},

	async updateGroupMembers(chatId: ChatId, addUsers: Principal[], removeUsers: Principal[]) {
		if ('Direct' in chatId) {
			throw new Error('updateGroupMembers: chatId is a direct chat');
		}
		const modification: GroupModification = {
			remove_participants: removeUsers,
			add_participants: addUsers
		};
		const result = await (await getActor()).modify_group_chat_participants(chatId.Group, modification);
		if ('Ok' in result) {
			console.log(
				`Group ${chatIdToString(chatId)} updated: +${addUsers.length}, -${removeUsers.length}`
			);
		} else {
			throw new Error(result.Err);
		}
	}
};

function shortenId(id: string): string {
	return id.length > 8 ? `${id.slice(0, 6)}…${id.slice(-2)}` : id;
}

function buildDummyRotationStatus() {
	return {
		lastRotation: new SvelteDate(1000000000000000),
		nextRotation: new SvelteDate(2000000000000000),
		isRotationNeeded: false,
		currentEpoch: 0
	};
}

