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
	VetKeyEpochMetadata,
	UserMessage,
	GroupChatMetadata
} from '../../declarations/encrypted_chat/encrypted_chat.did';
import { Principal } from '@dfinity/principal';
import { SvelteMap } from 'svelte/reactivity';
import { DerivedKeyMaterial, deriveSymmetricKey } from '@dfinity/vetkeys';

const DOMAIN_RATCHET_INIT = sizePrefixedBytesFromString('ic-vetkeys-chat-example-ratchet-init');
const DOMAIN_RATCHET_STEP = sizePrefixedBytesFromString('ic-vetkeys-chat-example-ratchet-step');
const DOMAIN_MESSAGE_ENCRYPTION = sizePrefixedBytesFromString(
	'ic-vetkeys-chat-example-message-encryption'
);

export const chats = $state<{ state: Chat[] }>({ state: [] });
export const selectedChatId = $state<{ state: ChatId | null }>({ state: null });
export const userConfig = $state<{ state: UserConfig | null }>({ state: null });
export const notifications = $state<{ state: Notification[] }>({ state: [] });
export const isLoading = $state({ state: false });
export const isBlocked = $state({ state: false });
export const availableChats = $state({ state: [] });
export const messages = $state<{ state: Record<string, Message[]> }>({ state: {} });

type VetKeyEpochMetadataState =
	| { status: 'missing' }
	| { status: 'loading'; promise: Promise<VetKeyEpochMetadata> }
	| { status: 'ready'; metadata: VetKeyEpochMetadata }
	| { status: 'error'; error: string };

// Keep a mapping from string chat id to the actor ChatId
const chatIdStringToVetKeyEpochMetadata = new SvelteMap<string, VetKeyEpochMetadataState>();

type KeyState =
	| { status: 'missing' }
	| { status: 'loading'; promise: Promise<CryptoKey> }
	| { status: 'ready'; symmetricKeyEpoch: bigint; key: CryptoKey }
	| { status: 'error'; error: string };

export const chatIdStringToEpochKeyState = new SvelteMap<string, KeyState>();

const chatIdStringToNumberOfMessagesIs = new Map<string, bigint>();
export const chatIdStringToNumberOfMessagesShould = new SvelteMap<string, bigint>();

export function getNumberOfMessagesIs(chatId: ChatId): bigint | undefined {
	const chatIdStr = chatIdToString(chatId);
	return chatIdStringToNumberOfMessagesIs.get(chatIdStr);
}

export function getChatIds(): ChatId[] {
	return chats.state.map((c) => c.id);
}

export function initVetKeyReactions() {
	$effect.root(() => {
		$effect(() => {
			if (auth.state.label !== 'initialized') return;

			for (const chat of chats.state) {
				if (chatIdStringToVetKeyEpochMetadata.has(chatIdToString(chat.id))) {
					console.log(
						'chatIdStringToVetKeyEpochMetadata already has ',
						chatIdToString(chat.id),
						' -- skipping'
					);
					continue;
				}
				const actor = getActor();
				if (!actor) throw new Error('Not authenticated');
				chatIdStringToVetKeyEpochMetadata.set(chatIdToString(chat.id), {
					status: 'loading',
					promise: chatAPI.getLatestVetKeyEpochMetadata(actor, chat.id)
				});
				console.log('chatIdStringToVetKeyEpochMetadata loading ', chatIdToString(chat.id));
				ensureVetKeyEpochMetadata(actor, chat.id).catch((error) => {
					console.error(
						`Failed to get vetkey epoch metadata for chat ${chatIdToString(chat.id)}: `,
						error
					);
				});
			}
		});

		$effect(() => {
			if (auth.state.label !== 'initialized') return;

			for (const [chatIdStr, meta] of chatIdStringToVetKeyEpochMetadata.entries()) {
				if (meta.status !== 'ready') continue;
				const key = `${chatIdStr}/${meta.metadata.epoch_id.toString()}`;
				if (chatIdStringToEpochKeyState.has(key)) {
					console.log(
						'chatIdStringToEpochKeyState already has ',
						key,
						meta.metadata.epoch_id.toString(),
						' -- skipping'
					);
					continue;
				}
				const actor = getActor();
				if (!actor) throw new Error('Not authenticated');
				const chatId = chatIdFromStr(chatIdStr);

				const p1 = chatAPI.getVetKey(actor, chatId, meta.metadata.epoch_id);
				const p2 = Promise.resolve(p1).then(async (vetKey) => {
					const rootKey = deriveSymmetricKey(new Uint8Array(), DOMAIN_RATCHET_INIT, 32);
					const exportable = false;
					return await globalThis.crypto.subtle.importKey(
						'raw',
						new Uint8Array(rootKey),
						'HKDF',
						exportable,
						['deriveKey', 'deriveBits']
					);
				});

				chatIdStringToEpochKeyState.set(key, {
					status: 'loading',
					promise: p2
				});
				console.log('chatIdStringToEpochKeyState loading ', key, meta.metadata.epoch_id.toString());
				ensureRootKey(actor, chatId, meta.metadata.epoch_id).catch((error) => {
					console.error(`Failed to get vetkey epoch metadata for chat ${chatIdStr}: `, error);
				});
			}
		});
	});
}

export const chatActions = {
	async initialize() {
		isLoading.state = true;

		try {
			// Load user config
			let config = await storageService.getUserConfig();
			if (!config) {
				config = storageService.getMyUserConfig();
				await storageService.saveUserConfig(config);
			}
			userConfig.state = config;

			await this.refreshChats();

			// Set up periodic cleanup
			//setInterval(() => {
			// TODO: cleanup disappearing messages
			//	}, 60000);
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
		const actor = getActor();
		if (actor) {
			const chatIds = await actor.get_my_chat_ids();
			for (const [chatId, numMessages] of chatIds) {
				const numMessagesShould = chatIdStringToNumberOfMessagesShould.get(chatIdToString(chatId));
				if (!numMessagesShould || numMessagesShould !== numMessages) {
					console.log(
						`refreshChats: setting numberOfMessagesShould for chat ${chatIdToString(chatId)} from ${numMessagesShould} to ${numMessages}`
					);
					chatIdStringToNumberOfMessagesShould.set(chatIdToString(chatId), numMessages);
				}
			}
			const summary: string = chatIds.reduce((acc, [chatId, numMessages]) => {
				if ('Direct' in chatId) {
					return (
						acc +
						' ' +
						chatId.Direct[0].toText() +
						' ' +
						chatId.Direct[1].toText() +
						' ' +
						numMessages.toString()
					);
				} else {
					return acc + ' ' + chatId.Group.toString() + ' ' + numMessages.toString();
				}
			}, '');
			console.log('fetched ' + chatIds.length + ' chats: ' + summary);
			for (const [chatId] of chatIds) {
				if (!chatIdStringToVetKeyEpochMetadata.has(chatIdToString(chatId))) {
					const result = await actor.get_latest_chat_vetkey_epoch_metadata(chatId);
					if ('Ok' in result) {
						chatIdStringToVetKeyEpochMetadata.set(chatIdToString(chatId), {
							status: 'ready',
							metadata: result.Ok
						});
					} else {
						console.error('Failed to get vetkey epoch metadata:', result.Err);
					}
				}
			}

			for (const [chatIdStr, meta] of chatIdStringToVetKeyEpochMetadata.entries()) {
				const chatId = chatIdFromStr(chatIdStr);

				const participants = meta.status === 'ready' ? meta.metadata.participants : [];
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
					? `Group: ${shortenId(String(chatId.Group.toString()))}`
					: participants[0].toString() === participants[1].toString()
						? 'Note to Self'
						: `Direct: ${participants.find((p) => p.toString() !== myPrincipalText)?.toString()}`;
				const now = new SvelteDate();

				const chat: Chat = {
					id: chatId,
					name,
					type: isGroup ? 'group' : 'direct',
					participants: participants.map((p) => ({
						id: p,
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
					vetKeyEpoch: Number(meta.status === 'ready' ? meta.metadata.epoch_id : 0n),
					symmetricRatchetEpoch: 0,
					ratchetEpoch: 0,
					unreadCount: 0,
					avatar: isGroup ? '👥' : '👤'
				};

				if (!chats.state.find((c) => chatIdToString(c.id) === chatIdStr)) {
					chats.state.push(chat);
				} else if (
					chats.state.find(
						(c) =>
							chatIdToString(c.id) === chatIdStr &&
							c.vetKeyEpoch !== Number(meta.status === 'ready' ? meta.metadata.epoch_id : 0n)
					)
				) {
					const pos = chats.state.findIndex(
						(c) =>
							chatIdToString(c.id) === chatIdStr &&
							c.vetKeyEpoch !== Number(meta.status === 'ready' ? meta.metadata.epoch_id : 0n)
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

	selectChat(chatId: ChatId) {
		selectedChatId.state = chatId;

		// Mark as read
		chats.state = chats.state.map((chat) =>
			chat.id === chatId ? { ...chat, unreadCount: 0 } : chat
		);
	},

	async loadChatMessages(chatId: ChatId, numMessagesIs: bigint | undefined) {
		console.log('loadChatMessages:', chatIdToString(chatId));
		try {
			const chatIdStr = chatIdToString(chatId);
			const chat = chats.state.find((c) => chatIdToString(c.id) === chatIdStr);
			if (!chat) {
				console.error('loadChatMessages: chat not found:', chatIdStr);
				return;
			}
			const lastMessageId = numMessagesIs ? numMessagesIs : 0n;
			const actor = getActor();
			if (!actor) return;
			const meta = chatIdStringToVetKeyEpochMetadata.get(chatIdStr);
			if (!meta) {
				console.error('loadChatMessages: Failed to get vetkey epoch metadata for chat:', chatIdStr);
				return;
			}
			const enc = await chatAPI.fetchEncryptedMessages(actor, chatId, lastMessageId, undefined);
			const mapped: Message[] = [];
			for (const m of enc) {
				const plaintextMessageContent = await decryptMessageContent(
					chatId,
					BigInt(m.metadata.vetkey_epoch),
					BigInt(m.metadata.symmetric_key_epoch),
					m.metadata.sender,
					new Uint8Array(m.content),
					m.metadata.sender_message_id
				);
				`/// decryptMessageContent: ${chatIdToString(chatId)} vetkeyEpoch: ${BigInt(m.metadata.vetkey_epoch).toString()} symmetricKeyEpoch: ${BigInt(m.metadata.symmetric_key_epoch).toString()} sender: ${m.metadata.sender.toText()} userMessageId: ${m.metadata.sender_message_id.toString()}`;
				m.content = plaintextMessageContent;
				mapped.push(toUiMessage(chatIdToString(chatId), m));
			}
			if (mapped.length !== 0) {
				console.log('loadChatMessages: mapped:', stringifyBigInt(mapped));
			} else {
				console.log('loadChatMessages: no messages loaded for chat:', chatIdStr);
			}
			messages.state[chatIdStr].push(...mapped);
			if (mapped.length !== 0) {
				const pos = chats.state.findIndex((c) => chatIdToString(c.id) === chatIdStr);
				const lastMessageBefore = chats.state[pos].lastMessage;
				chats.state[pos].lastMessage = mapped[mapped.length - 1];
				chatIdStringToNumberOfMessagesIs.set(
					chatIdToString(chat.id),
					BigInt(mapped[mapped.length - 1].id) + 1n
				);
				const lastMessageAfter = chats.state[pos].lastMessage;
				if (lastMessageBefore && lastMessageAfter && lastMessageBefore.id === lastMessageAfter.id) {
					console.log('loadChatMessages: last message is the same:', chatIdStr);
				} else {
					console.log(
						`loadChatMessages: loaded ${mapped.length} messages for chat ${chatIdStr}. Old last message id: ${lastMessageBefore?.id.toString()}, new last message id: ${lastMessageAfter?.id.toString()}`
					);
				}
			}
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
		chatId: ChatId,
		content: string,
		fileData?: { name: string; size: number; type: string; data: ArrayBuffer }
	) {
		const actor = getActor();
		if (!actor) throw new Error('Not authenticated');

		const chatIdStr = chatIdToString(chatId);

		if (auth.state.label !== 'initialized') {
			throw new Error('Unexpectedly not authenticated');
		}
		const myPrincipal = auth.state.client.getIdentity().getPrincipal();

		try {
			const vetKeyEpochMeta = chatIdStringToVetKeyEpochMetadata.get(chatIdStr);
			if (vetKeyEpochMeta?.status !== 'ready') {
				console.error('Failed to get vetkey epoch metadata for chat:', chatId);
				return;
			}
			const vetKeyEpochId = vetKeyEpochMeta.metadata.epoch_id;
			const elapsedSinceVetKeyEpoch =
				BigInt(Date.now()) * 1_000_000n - vetKeyEpochMeta.metadata.creation_timestamp;
			const symmetricKeyEpoch =
				elapsedSinceVetKeyEpoch / vetKeyEpochMeta.metadata.symmetric_key_rotation_duration;

			const buf = new Uint8Array(8);
			globalThis.crypto.getRandomValues(buf);
			let message_id = 0n;
			for (const b of buf) message_id = (message_id << 8n) | BigInt(b);

			const messageContent = JSON.stringify({ content, fileData });
			const encryptedMessageContent = await encryptMessageContent(
				chatId,
				vetKeyEpochId,
				symmetricKeyEpoch,
				myPrincipal,
				new TextEncoder().encode(messageContent),
				message_id
			);

			const message: UserMessage = {
				vetkey_epoch: vetKeyEpochId,
				content: encryptedMessageContent,
				symmetric_key_epoch: symmetricKeyEpoch,
				message_id
			};

			if ('Direct' in chatId) {
				const receiver =
					chatId.Direct[0].toString() === myPrincipal.toString()
						? chatId.Direct[1]
						: chatId.Direct[0];
				await chatAPI.sendDirectMessage(actor, receiver, message);
			} else {
				await chatAPI.sendGroupMessage(actor, chatId.Group, message);
			}
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

	rotateKeys(chatId: string) {
		try {
			// Mark chat as updating
			chats.state = chats.state.map((chat) =>
				chatIdToString(chat.id) === chatId ? { ...chat, isUpdating: true } : chat
			);

			const stats: SymmetricRatchetStats = chatAPI.getRatchetStats();

			// Update chat with new key status (dummy update)
			chats.state = chats.state.map((chat) =>
				chatIdToString(chat.id) === chatId
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
				chatIdToString(chat.id) === chatId ? { ...chat, isUpdating: false } : chat
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

	async createDirectChat(
		receiverPrincipalText: string,
		rotationMinutes: number,
		expirationMinutes: number
	) {
		try {
			const actor = getActor();
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
			const actor = getActor();
			if (!actor) throw new Error('Not authenticated');
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

function getActor(): ActorSubclass<_SERVICE> | undefined {
	if (auth.state.label === 'initialized') {
		const host = process.env.DFX_NETWORK === 'ic' ? 'https://icp-api.io' : 'http://localhost:8000';
		const shouldFetchRootKey = process.env.DFX_NETWORK !== 'ic';
		const agent = HttpAgent.createSync({
			identity: auth.state.client.getIdentity(),
			fetch,
			host,
			shouldFetchRootKey
		});
		if (!process.env.CANISTER_ID_ENCRYPTED_CHAT) {
			throw new Error('CANISTER_ID_ENCRYPTED_CHAT is not set');
		}
		return createActor(process.env.CANISTER_ID_ENCRYPTED_CHAT, { agent });
	} else {
		return undefined;
	}
}

export function chatIdToString(chatId: ChatId): string {
	if ('Group' in chatId) return `group/${chatId.Group.toString()}`;
	const [a, b] = chatId.Direct;
	return `direct/${a.toString()}/${b.toString()}`;
}

export function chatIdFromStr(chatIdStr: string): ChatId {
	if (typeof chatIdStr !== 'string')
		throw new Error('chatIdStr is not a string but ' + typeof chatIdStr);
	if (chatIdStr.startsWith('group/')) return { Group: BigInt(chatIdStr.slice(6)) };
	const [a, b] = chatIdStr.split('/').slice(1);
	return { Direct: [Principal.fromText(a), Principal.fromText(b)] };
}

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

function toUiMessage(chatIdStr: string, m: EncryptedMessage): Message {
	const senderPrincipal = m.metadata.sender.toText();
	const currentPrincipal =
		auth.state.label === 'initialized'
			? auth.state.client.getIdentity().getPrincipal().toString()
			: undefined;
	const senderId =
		currentPrincipal && senderPrincipal === currentPrincipal ? 'current-user' : senderPrincipal;
	const contentStr = new TextDecoder().decode(new Uint8Array(m.content));
	const contentTyped: {
		content: string;
		fileData?: { name: string; size: number; type: string; data: ArrayBuffer };
	} = JSON.parse(contentStr);
	return {
		id: m.metadata.chat_message_id.toString(),
		chatId: chatIdStr,
		senderId,
		content: contentTyped.content,
		timestamp: new SvelteDate(Number(m.metadata.timestamp / BigInt(1_000_000))),
		type: 'text',
		isEncrypted: true,
		vetkeyEpoch: Number(m.metadata.vetkey_epoch),
		symmetricRatchetEpoch: Number(m.metadata.symmetric_key_epoch)
	};
}

async function ensureVetKeyEpochMetadata(actor: ActorSubclass<_SERVICE>, chatId: ChatId) {
	const chatIdStr = chatIdToString(chatId);
	console.log('ensureVetKeyEpochMetadata', chatIdStr);
	const cur = chatIdStringToVetKeyEpochMetadata.get(chatIdStr);

	if (cur?.status === 'loading') {
		if (!actor) throw new Error('Not authenticated');

		await cur.promise
			.then((metadata) => {
				// transition to ready when it resolves
				chatIdStringToVetKeyEpochMetadata.set(chatIdStr, { status: 'ready', metadata });
				console.log('ensureVetKeyEpochMetadata ready', chatIdStr);
				return metadata;
			})
			.catch((error) => {
				// transition to error so UI can react
				chatIdStringToVetKeyEpochMetadata.set(chatIdStr, { status: 'error', error });
				console.log('ensureVetKeyEpochMetadata error', chatIdStr);
				throw error;
			});
	}
}

async function fastForwardSymmetricRatchetWithoutSavingUntil(
	chatId: ChatId,
	vetkeyEpoch: bigint,
	symmetricKeyEpoch: bigint
): Promise<DerivedKeyMaterial> {
	const chatIdStr = chatIdToString(chatId);
	const mapKey = `${chatIdStr}/${vetkeyEpoch.toString()}`;
	const cur = chatIdStringToEpochKeyState.get(mapKey);
	if (!cur) {
		throw new Error('Bug: failed to get epoch key');
	}
	if (cur.status !== 'ready') {
		throw new Error('Bug: epoch key is not ready for symmetric ratchet');
	}
	const { key, symmetricKeyEpoch: currentSymmetricKeyEpoch } = cur;
	if (currentSymmetricKeyEpoch >= symmetricKeyEpoch) {
		return DerivedKeyMaterial.fromCryptoKey(key);
	}

	let derivedKeyState = { epochKey: key, symmetricKeyEpoch: currentSymmetricKeyEpoch };
	while (derivedKeyState.symmetricKeyEpoch < symmetricKeyEpoch) {
		derivedKeyState = {
			epochKey: await deriveNextEpochKey(
				derivedKeyState.epochKey,
				derivedKeyState.symmetricKeyEpoch
			),
			symmetricKeyEpoch: derivedKeyState.symmetricKeyEpoch + 1n
		};
	}
	return DerivedKeyMaterial.fromCryptoKey(derivedKeyState.epochKey);
}

async function ensureRootKey(actor: ActorSubclass<_SERVICE>, chatId: ChatId, epochId: bigint) {
	const chatIdStr = chatIdToString(chatId);
	const mapKey = `${chatIdStr}/${epochId.toString()}`;
	const cur = chatIdStringToEpochKeyState.get(mapKey);

	if (cur?.status === 'loading') {
		await cur.promise
			.then((key) => {
				console.log('ensureRootKey ready', chatIdStr);
				chatIdStringToEpochKeyState.set(mapKey, {
					status: 'ready',
					symmetricKeyEpoch: 0n,
					key
				});
				return key;
			})
			.catch((error) => {
				console.log('ensureRootKey error', chatIdStr);
				chatIdStringToEpochKeyState.set(mapKey, {
					status: 'error',
					error
				});
				throw error;
			});
	}
}

async function symmetricRatchetUntil(
	chatId: ChatId,
	vetkeyEpoch: bigint,
	symmetricKeyEpoch: bigint
) {
	while ((await getCurrentSymmetricEpoch(chatId, vetkeyEpoch)) < symmetricKeyEpoch) {
		try {
			const currentSymmetricEpoch = await getCurrentSymmetricEpoch(chatId, vetkeyEpoch);
			const chatIdStr = chatIdToString(chatId);
			const mapKey = `${chatIdStr}/${vetkeyEpoch.toString()}`;
			chatIdStringToEpochKeyState.set(mapKey, {
				status: 'ready',
				symmetricKeyEpoch: currentSymmetricEpoch + 1n,
				key: await symmetricRatchet(chatId, vetkeyEpoch, currentSymmetricEpoch)
			});
		} catch (error) {
			console.warn('symmetricRatchetUntil: ', error);
		}
	}
}

async function symmetricRatchet(
	chatId: ChatId,
	vetkeyEpoch: bigint,
	expectedSymmetricKeyEpoch: bigint
) {
	const chatIdStr = chatIdToString(chatId);
	const mapKey = `${chatIdStr}/${vetkeyEpoch.toString()}`;
	const cur = chatIdStringToEpochKeyState.get(mapKey);
	console.log(
		`symmetricRatchet: ${chatIdStr} vetkeyEpoch: ${vetkeyEpoch.toString()} expectedSymmetricKeyEpoch: ${expectedSymmetricKeyEpoch.toString()}`
	);
	if (!cur) {
		throw new Error('Bug: failed to get epoch key');
	}
	if (cur.status !== 'ready') {
		throw new Error('Bug: epoch key is not ready for symmetric ratchet');
	}
	const { key, symmetricKeyEpoch: currentSymmetricKeyEpoch } = cur;
	if (currentSymmetricKeyEpoch !== expectedSymmetricKeyEpoch) {
		throw new Error(
			`Failed to send message: wrong symmetric key epoch in message: expected ${expectedSymmetricKeyEpoch} but got ${currentSymmetricKeyEpoch}`
		);
	}

	return await deriveNextEpochKey(key, currentSymmetricKeyEpoch);
}

async function deriveNextEpochKey(
	epochKey: CryptoKey,
	currentSymmetricKeyEpoch: bigint
): Promise<CryptoKey> {
	console.log(`deriveNextEpochKey: ${currentSymmetricKeyEpoch.toString()}`);
	const exportable = false;
	const domainSeparator = new Uint8Array([
		...DOMAIN_RATCHET_STEP,
		...uBigIntTo8ByteUint8ArrayBigEndian(currentSymmetricKeyEpoch)
	]);
	const algorithm = {
		name: 'HKDF',
		hash: 'SHA-256',
		length: 32 * 8,
		info: domainSeparator,
		salt: new Uint8Array()
	};

	const rawKey = await globalThis.crypto.subtle.deriveBits(algorithm, epochKey, 8 * 32);

	return await globalThis.crypto.subtle.importKey('raw', rawKey, algorithm, exportable, [
		'deriveKey',
		'deriveBits'
	]);
}

// Initialize on module load (browser only)
if (typeof window !== 'undefined') {
	void chatActions.initialize();
}

export function stringifyBigInt(value: any): string {
	return JSON.stringify(value, (_key, value) => {
		if (typeof value === 'bigint') {
			return value.toString();
		}
		return value;
	});
}

async function getCurrentSymmetricEpoch(chatId: ChatId, vetkeyEpoch: bigint): Promise<bigint> {
	const chatIdStr = chatIdToString(chatId);
	const mapKey = `${chatIdStr}/${vetkeyEpoch.toString()}`;
	while (true) {
		const cur = chatIdStringToEpochKeyState.get(mapKey);
		if (cur?.status === 'ready') {
			return cur.symmetricKeyEpoch;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

async function getSymmetricEpochKey(
	chatId: ChatId,
	vetkeyEpoch: bigint,
	symmetricKeyEpoch: bigint
): Promise<DerivedKeyMaterial> {
	const chatIdStr = chatIdToString(chatId);
	const mapKey = `${chatIdStr}/${vetkeyEpoch.toString()}`;
	let cur: KeyState | undefined = undefined; // wait in a loop with timeout till we get the key

	console.log(
		`getSymmetricEpochKey: ${chatIdStr} vetkeyEpoch: ${vetkeyEpoch.toString()} symmetricKeyEpoch: ${symmetricKeyEpoch.toString()}`
	);

	const startTime = Date.now();
	while (!cur || cur.status !== 'ready') {
		cur = chatIdStringToEpochKeyState.get(mapKey);
		if (cur && cur.status === 'error') {
			throw new Error('Failed to get epoch key: ' + cur.error);
		}
		if (!cur || cur.status !== 'ready') {
			if (Date.now() - startTime > 30000) {
				chatActions.addNotification({
					type: 'error',
					title: 'Load Error',
					message: 'Failed to load messages for this chat.',
					isDismissible: true
				});
				throw new Error('Failed to send message: failed to get epoch key after 30 seconds');
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	if (!cur) {
		throw new Error('Bug: failed to get epoch key');
	}

	const { key, symmetricKeyEpoch: symmetricKeyEpochKeyState } = cur;

	if (symmetricKeyEpochKeyState !== symmetricKeyEpoch) {
		throw new Error(
			`Failed to send message: wrong symmetric key epoch in message: expected ${symmetricKeyEpoch} but got ${symmetricKeyEpochKeyState}`
		);
	}

	return DerivedKeyMaterial.fromCryptoKey(key);
}

async function encryptMessageContent(
	chatId: ChatId,
	vetkeyEpoch: bigint,
	symmetricKeyEpoch: bigint,
	sender: Principal,
	plaintextMessageContent: Uint8Array,
	userMessageId: bigint
): Promise<Uint8Array> {
	const epochKey = await fastForwardSymmetricRatchetWithoutSavingUntil(
		chatId,
		vetkeyEpoch,
		symmetricKeyEpoch
	);
	const domainSeparator = messageEncryptionDomainSeparator(sender, userMessageId);
	return await epochKey.encryptMessage(plaintextMessageContent, domainSeparator);
}

async function decryptMessageContent(
	chatId: ChatId,
	vetkeyEpoch: bigint,
	symmetricKeyEpoch: bigint,
	sender: Principal,
	encryptedMessageContent: Uint8Array,
	userMessageId: bigint
): Promise<Uint8Array> {
	console.log(
		`decryptMessageContent: ${chatIdToString(chatId)} vetkeyEpoch: ${vetkeyEpoch.toString()} symmetricKeyEpoch: ${symmetricKeyEpoch.toString()} sender: ${sender.toText()} userMessageId: ${userMessageId.toString()}`
	);
	const currentSymmetricEpoch = await getCurrentSymmetricEpoch(chatId, vetkeyEpoch);
	if (currentSymmetricEpoch < symmetricKeyEpoch) {
		await symmetricRatchetUntil(chatId, vetkeyEpoch, symmetricKeyEpoch);
	}
	const epochKey = await getSymmetricEpochKey(chatId, vetkeyEpoch, symmetricKeyEpoch);
	const domainSeparator = messageEncryptionDomainSeparator(sender, userMessageId);
	return await epochKey.decryptMessage(encryptedMessageContent, domainSeparator);
}

function messageEncryptionDomainSeparator(sender: Principal, messageId: bigint): Uint8Array {
	return new Uint8Array([
		...DOMAIN_MESSAGE_ENCRYPTION,
		...sender.toUint8Array(),
		...uBigIntTo8ByteUint8ArrayBigEndian(messageId)
	]);
}

function uBigIntTo8ByteUint8ArrayBigEndian(value: bigint): Uint8Array {
	if (value < 0n) throw new RangeError('Accpts only bigint n >= 0');

	const bytes = new Uint8Array(8);
	for (let i = 0; i < 8; i++) {
		bytes[i] = Number((value >> BigInt(i * 8)) & 0xffn);
	}
	return bytes;
}

function sizePrefixedBytesFromString(text: string): Uint8Array {
	const bytes = new TextEncoder().encode(text);
	if (bytes.length > 255) {
		throw new Error('Text is too long');
	}
	const size = new Uint8Array(1);
	size[0] = bytes.length & 0xff;
	return new Uint8Array([...size, ...bytes]);
}
