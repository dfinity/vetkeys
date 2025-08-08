import type { Chat, Message, UserConfig, Notification, SymmetricRatchetStats } from '../types';
import { chatAPI } from '../services/api';
import { storageService } from '../services/storage';
import { SvelteDate } from 'svelte/reactivity';
import { auth } from '$lib/stores/auth.svelte';
import { createActor } from '../../declarations/encrypted_chat';
import { HttpAgent, type ActorSubclass } from '@dfinity/agent';
import fetch from 'isomorphic-fetch';
import type {
	_SERVICE,
	ChatId,
	EncryptedMessage,
	VetKeyEpochMetadata
} from '../../declarations/encrypted_chat/encrypted_chat.did';
import { Principal } from '@dfinity/principal';
import { SvelteMap } from 'svelte/reactivity';

export const chats = $state<{ state: Chat[] }>({ state: [] });
export const selectedChatId = $state<{ state: string | null }>({ state: null });
export const userConfig = $state<{ state: UserConfig | null }>({ state: null });
export const notifications = $state<{ state: Notification[] }>({ state: [] });
export const isLoading = $state({ state: false });
export const isBlocked = $state({ state: false });
export const availableChats = $state({ state: [] });
export const messages = $state<{ state: Record<string, Message[]> }>({ state: {} });

// Keep a mapping from string chat id to the actor ChatId
const chatIdStringToVetKeyEpochMetadata = new SvelteMap<ChatId, VetKeyEpochMetadata>();

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

			await this.refreshChats();

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
			const chatIds = await actor.get_my_chat_ids();
			console.log('fetched ' + (await chatIds).length + ' chats');
			for (const [chatId] of chatIds) {
				if (!chatIdStringToVetKeyEpochMetadata.has(chatId)) {
					const result = await actor.get_latest_chat_vetkey_epoch_metadata(chatId);
					if ('Ok' in result) {
						chatIdStringToVetKeyEpochMetadata.set(chatId, result.Ok);
					} else {
						console.error('Failed to get vetkey epoch metadata:', result.Err);
					}
				}
			}

			for (const [chatId, meta] of chatIdStringToVetKeyEpochMetadata.entries()) {
				const chatIdStr = chatIdToString(chatId);

				const participants = meta?.participants;
				if (!participants) {
					console.error('Failed to get participants for chat:', chatId);
					continue;
				}
				const isGroup = 'Group' in chatId;
				if (auth.state.label !== 'initialized') {
					throw new Error('Unexpectedly not authenticated');
				}
				const myPrincipalText = auth.state.client.getIdentity().getPrincipal().toText();
				const name = isGroup
					? `Group: ${shortenId(String(meta?.epoch_id ?? 0n))}`
					: `Direct: ${participants.find((p) => p.toString() !== myPrincipalText)?.toString()}`;
				const now = new SvelteDate();

				const chat: Chat = {
					id: chatIdStr,
					name,
					type: isGroup ? 'group' : 'direct',
					participants: participants.map((p) => ({
						id: p.toText(),
						name: myPrincipalText === p.toText() ? 'Note to Self' : 'Principal: ' + p.toText(),
						avatar: '👤',
						isOnline: true
					})),
					lastMessage: undefined,
					lastActivity: now,
					isReady: true,
					isUpdating: false,
					disappearingMessagesDuration: 0,
					keyRotationStatus: buildDummyRotationStatus(),
					vetKeyEpoch: Number(meta?.epoch_id ?? 0n),
					symmetricRatchetEpoch: 0,
					ratchetEpoch: 0,
					unreadCount: 0,
					avatar: isGroup ? '👥' : '👤'
				};

				if (!chats.state.find((c) => c.id === chatIdStr)) {
					chats.state.push(chat);
				} else if (
					chats.state.find(
						(c) => c.id === chatIdStr && c.vetKeyEpoch !== Number(meta?.epoch_id ?? 0n)
					)
				) {
					const pos = chats.state.findIndex(
						(c) => c.id === chatIdStr && c.vetKeyEpoch !== Number(meta?.epoch_id ?? 0n)
					);
					chats.state[pos] = chat;
				} else {
					continue;
				}

				// Initialize empty messages cache; we lazy-load on demand
				if (!messages.state[chatIdStr]) messages.state[chatIdStr] = [];
			}
		}
	},

	selectChat(chatId: string) {
		selectedChatId.state = chatId;

		// Mark as read
		chats.state = chats.state.map((chat) =>
			chat.id === chatId ? { ...chat, unreadCount: 0 } : chat
		);
	},

	async loadChatMessages(chatId: ChatId) {
		try {
			const actor = await getActor();
			if (!actor) return;
			const meta = chatIdStringToVetKeyEpochMetadata.get(chatId);
			if (!meta) return;
			const startId = meta.messages_start_with_id;
			const enc = await chatAPI.fetchEncryptedMessages(actor, chatId, startId, undefined);
			const mapped: Message[] = enc.map((m) => toUiMessage(chatIdToString(chatId), m));
			messages.state = { ...messages.state, [chatIdToString(chatId)]: mapped };
			for (const m of mapped) await storageService.saveMessage(m);
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
		chatIdStr: string,
		content: string,
		fileData?: { name: string; size: number; type: string; data: ArrayBuffer }
	) {
		try {
			const newMessage: Message = {
				id: `${Date.now()}`,
				chatId: chatIdStr,
				senderId: 'current-user',
				content: content,
				timestamp: new SvelteDate(),
				type: fileData ? 'file' : 'text',
				fileData,
				isEncrypted: false,
				ratchetEpoch: 0
			};
			messages.state = {
				...messages.state,
				[chatIdStr]: [...(messages.state[chatIdStr] || []), newMessage]
			};

			// Update chat last activity
			chats.state = chats.state.map((chat) =>
				chat.id === chatIdStr
					? { ...chat, lastActivity: new SvelteDate(), lastMessage: newMessage }
					: chat
			);

			// Save to storage
			await storageService.saveMessage(newMessage);
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

			const stats: SymmetricRatchetStats = await chatAPI.getRatchetStats();

			// Update chat with new key status (dummy update)
			chats.state = chats.state.map((chat) =>
				chat.id === chatId
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
	},

	async createDirectChat(
		receiverPrincipalText: string,
		rotationMinutes: number,
		expirationMinutes: number
	) {
		try {
			const actor = await getActor();
			if (!actor) throw new Error('Not authenticated');
			const receiver = Principal.fromText(receiverPrincipalText.trim());
			await chatAPI.createDirectChat(
				actor,
				receiver,
				BigInt(Math.max(0, Math.trunc(rotationMinutes))),
				BigInt(Math.max(0, Math.trunc(expirationMinutes)))
			);
			chatActions.addNotification({
				type: 'success',
				title: 'Chat Created',
				message: 'Direct chat created successfully.',
				isDismissible: true,
				duration: 3000
			});
			await chatActions.refreshChats();
		} catch (error) {
			console.error('Failed to create direct chat:', error);
			chatActions.addNotification({
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
			const actor = await getActor();
			if (!actor) throw new Error('Not authenticated');
			const { Principal } = await import('@dfinity/principal');
			const participants = participantPrincipalTexts
				.map((t) => t.trim())
				.filter(Boolean)
				.map((t) => Principal.fromText(t));
			const meta = await chatAPI.createGroupChat(
				actor,
				participants,
				BigInt(Math.max(0, Math.trunc(rotationMinutes))),
				BigInt(Math.max(0, Math.trunc(expirationMinutes)))
			);
			chatActions.addNotification({
				type: 'success',
				title: 'Group Created',
				message: `Group chat #${meta.chat_id.toString()} created successfully.`,
				isDismissible: true,
				duration: 3000
			});
			await chatActions.refreshChats();
		} catch (error) {
			console.error('Failed to create group chat:', error);
			chatActions.addNotification({
				type: 'error',
				title: 'Create Group Failed',
				message: 'Failed to create group chat. Check the Principals and try again.',
				isDismissible: true
			});
		}
	}
};

async function getActor(): Promise<ActorSubclass<_SERVICE> | undefined> {
	if (auth.state.label === 'initialized') {
		const host = process.env.DFX_NETWORK === 'ic' ? 'https://icp-api.io' : 'http://localhost:8000';
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

function chatIdToString(chatId: ChatId): string {
	if ('Group' in chatId) return `group-${chatId.Group.toString()}`;
	const [a, b] = chatId.Direct;
	return `direct-${a.toString()}-${b.toString()}`;
}

function shortenId(id: string): string {
	return id.length > 8 ? `${id.slice(0, 6)}…${id.slice(-2)}` : id;
}

function buildDummyParticipants(principals: readonly Principal[] | undefined) {
	const currentPrincipal =
		auth.state.label === 'initialized'
			? auth.state.client.getIdentity().getPrincipal().toString()
			: undefined;
	const defaultOther = {
		id: 'other-user',
		name: 'Friend',
		avatar: '🧑',
		isOnline: true
	};
	if (!principals || principals.length === 0) {
		return [{ id: 'current-user', name: 'You', avatar: '👤', isOnline: true }, defaultOther];
	}
	return principals.map((p, idx) => {
		const pid = p.toString();
		const isSelf = currentPrincipal && pid === currentPrincipal;
		return {
			id: isSelf ? 'current-user' : pid,
			name: isSelf ? 'You' : `User ${idx + 1}`,
			avatar: isSelf ? '👤' : ['🧑', '👩', '👨', '🧔', '🧕'][idx % 5],
			isOnline: isSelf ? true : Math.random() > 0.3
		};
	});
}

function buildDummyRotationStatus() {
	return {
		lastRotation: new SvelteDate(1000000000000000),
		nextRotation: new SvelteDate(2000000000000000),
		isRotationNeeded: false,
		currentEpoch: 0
	};
}

function toUiMessage(chatIdStr: string, m: EncryptedMessage): Message {
	const senderPrincipal = (m.metadata.sender as unknown as Principal).toString?.() ?? 'unknown';
	const currentPrincipal =
		auth.state.label === 'initialized'
			? auth.state.client.getIdentity().getPrincipal().toString()
			: undefined;
	const senderId =
		currentPrincipal && senderPrincipal === currentPrincipal ? 'current-user' : senderPrincipal;
	return {
		id: m.metadata.chat_message_id.toString(),
		chatId: chatIdStr,
		senderId,
		content: `[encrypted ${m.content.length} bytes]`,
		timestamp: new SvelteDate(Number(m.metadata.timestamp / BigInt(1_000_000))),
		type: 'text',
		isEncrypted: true,
		ratchetEpoch: Number(m.metadata.symmetric_key_epoch)
	};
}

async function safeGetEpochMetadata(
	actor: ActorSubclass<_SERVICE>,
	chatId: ChatId
): Promise<VetKeyEpochMetadata | undefined> {
	try {
		const res = await chatAPI.getAccessibleVetKeyEpochMetadata(actor, chatId);
		return res;
	} catch {
		return undefined;
	}
}

// Initialize on module load (browser only)
if (typeof window !== 'undefined') {
	void chatActions.initialize();
}
