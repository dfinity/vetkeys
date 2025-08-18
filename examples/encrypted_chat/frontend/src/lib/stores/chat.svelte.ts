import {
	type Chat,
	type Message,
	type UserConfig,
	type Notification,
	type SymmetricRatchetStats,
	EncryptedCacheManager as EncryptedCacheManager
} from '../types';
import { chatAPI } from '../services/api';
import { storageService } from '../services/messageStorage';
import { SvelteDate } from 'svelte/reactivity';
import { auth, getMyPrincipal } from '$lib/stores/auth.svelte';
import { createActor } from '../../declarations/encrypted_chat';
import { HttpAgent, type ActorSubclass } from '@dfinity/agent';
import fetch from 'isomorphic-fetch';
import type {
	_SERVICE,
	ChatId,
	EncryptedMessage,
	VetKeyEpochMetadata,
	UserMessage,
	GroupModification
} from '../../declarations/encrypted_chat/encrypted_chat.did';
import { Principal } from '@dfinity/principal';
import { SvelteMap } from 'svelte/reactivity';
import {
	chatIdToString,
	chatIdVetKeyEpochFromString,
	chatIdVetKeyEpochToString,
	stringifyBigInt
} from '$lib/utils';
import {
	encryptMessageContent,
	decryptMessageContent,
	fetchResharedIbeEncryptedVetKeys,
	chatIdStringToEpochKeyState,
	deriveRootKeyAndDispatchCaching,
	ensureRootKey,
	reshareIbeEncryptedVetKeys
} from './crypto.svelte';

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

const chatIdVetKeyEpochStringToVetKeyEpochMetadata = new SvelteMap<
	string,
	VetKeyEpochMetadataState
>();

// eslint-disable-next-line svelte/prefer-svelte-reactivity
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
			console.log('Running vetKey loader $effect...');
			if (auth.state.label !== 'initialized') return;

			for (const chat of chats.state) {
				const chatIdVetKeyEpochStr = chatIdVetKeyEpochToString(chat.id, BigInt(chat.vetKeyEpoch));
				const meta = chatIdVetKeyEpochStringToVetKeyEpochMetadata.get(chatIdVetKeyEpochStr);
				if (meta?.status === 'ready' || meta?.status === 'loading') {
					console.log(
						'chatIdVetKeyEpochStringToVetKeyEpochMetadata already has or loading ',
						chatIdVetKeyEpochStr,
						' -- skipping'
					);
					continue;
				}
				const actor = getActor();
				if (!actor) throw new Error('Not authenticated');

				if (meta?.status === 'missing') {
					console.log(
						'chatIdVetKeyEpochStringToVetKeyEpochMetadata missing ',
						chatIdVetKeyEpochStr,
						' -- adding a promise to fetch it'
					);
					chatIdVetKeyEpochStringToVetKeyEpochMetadata.set(chatIdVetKeyEpochStr, {
						status: 'loading',
						promise: chatAPI.getLatestVetKeyEpochMetadata(actor, chat.id)
					});
				}

				console.log(
					'chatIdVetKeyEpochStringToVetKeyEpochMetadata loading ',
					chatIdVetKeyEpochToString(chat.id, BigInt(chat.vetKeyEpoch))
				);
				ensureVetKeyEpochMetadata(actor, chat.id, BigInt(chat.vetKeyEpoch)).catch((error) => {
					console.error(
						`Failed to get vetkey epoch metadata for chat ${chatIdToString(chat.id)} and vetkey epoch ${chat.vetKeyEpoch}: `,
						error
					);
				});
			}
		});

		$effect(() => {
			console.log('Running metadata to key state $effect...');
			if (auth.state.label !== 'initialized') return;

			for (const chatIdStrVetKeyEpoch of chatIdVetKeyEpochStringToVetKeyEpochMetadata.keys()) {
				if (chatIdStringToEpochKeyState.has(chatIdStrVetKeyEpoch)) {
					console.log(
						'chatIdStringToEpochKeyState already has ',
						chatIdStrVetKeyEpoch,
						' -- skipping'
					);
				} else {
					console.log(
						'chatIdStringToEpochKeyState has no entry for ',
						chatIdStrVetKeyEpoch,
						' -- adding a missing entry'
					);
					chatIdStringToEpochKeyState.set(chatIdStrVetKeyEpoch, {
						status: 'missing'
					});
				}
			}
		});

		$effect(() => {
			console.log('Running ensureEpochKey $effect...');
			if (auth.state.label !== 'initialized') return;
			const actor = getActor();
			if (!actor) throw new Error('Not authenticated');

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for (const [chatIdStrVetKeyEpoch, state] of chatIdStringToEpochKeyState.entries()) {
				if (state.status !== 'missing') {
					console.log(
						'chatIdStringToEpochKeyState already has ',
						chatIdStrVetKeyEpoch,
						'with status',
						state.status,
						' -- skipping'
					);
					continue;
				}
				console.log(
					'Running ensureEpochKey $effect for chatIdStrVetKeyEpoch: ',
					chatIdStrVetKeyEpoch
				);
				const { chatId, vetKeyEpoch } = chatIdVetKeyEpochFromString(chatIdStrVetKeyEpoch);

				const vetKeyEncryptedCacheManager = new EncryptedCacheManager(getMyPrincipal(), actor);
				const rootKeyPromise = vetKeyEncryptedCacheManager
					.fetchAndDecryptFor(chatId, vetKeyEpoch)
					.catch((error) => {
						console.info(
							`User doesn't have key cache for chat ${chatIdToString(chatId)} and vetKey epoch ${vetKeyEpoch.toString()}: `,
							error
						);

						return fetchResharedIbeEncryptedVetKeys(actor, chatId, vetKeyEpoch, getMyPrincipal())
							.then((resharedVetKey) => {
								console.log('successfully fetched reshared IBE encrypted vetkey: ', resharedVetKey);
								return deriveRootKeyAndDispatchCaching(actor, chatId, vetKeyEpoch, resharedVetKey);
							})
							.catch((error) => {
								console.info('Failed to fetch reshared IBE encrypted vetkey: ', error);
								return Promise.resolve(chatAPI.getVetKey(actor, chatId, vetKeyEpoch)).then(
									(vetKey) => {
										const meta =
											chatIdVetKeyEpochStringToVetKeyEpochMetadata.get(chatIdStrVetKeyEpoch);
										if (meta?.status !== 'ready') {
											throw new Error(
												`No vetKey epoch metadata for chat ${chatIdToString(chatId)} and vetkey epoch ${vetKeyEpoch.toString()}: metadata status ${meta?.status}`
											);
										}
										const otherParticipants = meta.metadata.participants.filter(
											(p) => p.toString() !== getMyPrincipal().toString()
										);

										reshareIbeEncryptedVetKeys(
											actor,
											chatId,
											vetKeyEpoch,
											otherParticipants,
											vetKey.signatureBytes()
										).catch((error) => {
											console.error(
												`Failed to reshare IBE encrypted vetkeys for chat ${chatIdToString(chatId)} vetkeyEpoch ${meta.metadata.epoch_id.toString()}: `,
												error
											);
										});

										return deriveRootKeyAndDispatchCaching(
											actor,
											chatId,
											vetKeyEpoch,
											vetKey.signatureBytes()
										);
									}
								);
							});
					});
				const cryptoKeyPromise = Promise.resolve(rootKeyPromise).then(
					async ({ keyBytes, symmetricKeyEpoch }) => {
						const exportable = false;
						const key = await globalThis.crypto.subtle.importKey(
							'raw',
							new Uint8Array(keyBytes),
							'HKDF',
							exportable,
							['deriveKey', 'deriveBits']
						);
						return { key, symmetricKeyEpoch };
					}
				);

				chatIdStringToEpochKeyState.set(chatIdStrVetKeyEpoch, {
					status: 'loading',
					promise: cryptoKeyPromise
				});
				console.log('chatIdStringToEpochKeyState loading ', chatIdStrVetKeyEpoch, vetKeyEpoch);
				ensureRootKey(chatId, vetKeyEpoch).catch((error) => {
					console.error(
						`Failed to get root key for chat ${chatIdToString(chatId)} and vetKey epoch ${vetKeyEpoch.toString()}: `,
						error
					);
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
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const newChatIds = new Set<ChatId>();
			for (const [chatId, numMessages] of chatIds) {
				const numMessagesShould = chatIdStringToNumberOfMessagesShould.get(chatIdToString(chatId));
				if (!numMessagesShould) {
					newChatIds.add(chatId);
				}
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
						(acc.length > 0 ? ' | ' : '') +
						chatId.Direct[0].toText() +
						' ' +
						chatId.Direct[1].toText() +
						' #' +
						numMessages.toString()
					);
				} else {
					return (
						acc +
						(acc.length > 0 ? ' | ' : '') +
						chatId.Group.toString() +
						' #' +
						numMessages.toString()
					);
				}
			}, '');
			console.log('fetched ' + chatIds.length + ' chats: ' + summary);
			for (const [chatId] of chatIds) {
				if (newChatIds.has(chatId)) {
					const metadata = await chatAPI.getLatestVetKeyEpochMetadata(actor, chatId);
					const vetKeyEpochStr = chatIdVetKeyEpochToString(chatId, metadata.epoch_id);
					if (!chatIdVetKeyEpochStringToVetKeyEpochMetadata.has(vetKeyEpochStr)) {
						chatIdVetKeyEpochStringToVetKeyEpochMetadata.set(
							chatIdVetKeyEpochToString(chatId, metadata.epoch_id),
							{
								status: 'ready',
								metadata
							}
						);
					}
				}
			}

			for (const [
				chatIdStrVetKeyEpoch,
				meta
			] of chatIdVetKeyEpochStringToVetKeyEpochMetadata.entries()) {
				const { chatId, vetKeyEpoch } = chatIdVetKeyEpochFromString(chatIdStrVetKeyEpoch);
				const chatIdStr = chatIdToString(chatId);

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
					vetKeyEpoch: Number(vetKeyEpoch),
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
			const vetKeyEpoch = BigInt(chat.vetKeyEpoch);
			const lastMessageId = numMessagesIs ? numMessagesIs : 0n;
			const actor = getActor();
			if (!actor) return;
			const chatIdVetKeyEpochStr = chatIdVetKeyEpochToString(chatId, vetKeyEpoch);
			const meta = chatIdVetKeyEpochStringToVetKeyEpochMetadata.get(chatIdVetKeyEpochStr);
			if (!meta) {
				console.error(
					'loadChatMessages: Failed to get vetkey epoch metadata for chat and vetkey epoch:',
					chatIdVetKeyEpochStr
				);
				return;
			}
			const enc = await chatAPI.fetchEncryptedMessages(actor, chatId, lastMessageId, undefined);
			const mapped: Message[] = [];
			for (let i = enc.length - 1; i >= 0; i--) {
				try {
					console.log(
						`decryptMessageContent: ${chatIdToString(chatId)} vetkeyEpoch: ${enc[i].metadata.vetkey_epoch.toString()} symmetricKeyEpoch: ${enc[i].metadata.symmetric_key_epoch.toString()} sender: ${enc[i].metadata.sender.toText()} userMessageId: ${enc[i].metadata.sender_message_id.toString()} messageId: ${enc[i].metadata.chat_message_id.toString()}`
					);
					const plaintextMessageContent = await decryptMessageContent(
						chatId,
						BigInt(enc[i].metadata.vetkey_epoch),
						BigInt(enc[i].metadata.symmetric_key_epoch),
						enc[i].metadata.sender,
						new Uint8Array(enc[i].content),
						enc[i].metadata.sender_message_id
					);
					enc[i].content = plaintextMessageContent;
					mapped.push(toUiMessage(chatIdToString(chatId), enc[i]));
				} catch (error) {
					if (error instanceof Error && error.message.startsWith('Wrong vetKey epoch')) {
						console.info(
							"Can't decrypt messages at or earlier than vetkey epoch ",
							enc[i].metadata.vetkey_epoch,
							' for chat ',
							chatIdStr,
							': ',
							error
						);
					} else {
						console.error(
							'loadChatMessages: Failed to decrypt message ',
							enc[i].metadata.sender_message_id,
							' for chat ',
							chatIdStr,
							': ',
							error
						);
					}
				}
			}
			mapped.reverse();
			if (mapped.length !== 0) {
				console.log('loadChatMessages: mapped:', stringifyBigInt(mapped));
			} else {
				console.log('loadChatMessages: no messages loaded for chat:', chatIdStr);
			}
			// Reassign to trigger reactivity for consumers relying on identity changes
			messages.state = {
				...messages.state,
				[chatIdStr]: [...((messages.state[chatIdStr] as Message[] | undefined) ?? []), ...mapped]
			};
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

		let repetitions = 0;
		const MAX_RETRIES = 10;

		// reencrypt and resend the message if vetkey or symmetric key epoch has changed
		while (repetitions < MAX_RETRIES) {
			if (auth.state.label !== 'initialized') {
				throw new Error('Unexpectedly not authenticated');
			}
			const myPrincipal = auth.state.client.getIdentity().getPrincipal();

			try {
				// get the latest vetkey epoch metadata from chats
				const vetKeyEpoch =
					chats.state.find((c) => chatIdToString(c.id) === chatIdToString(chatId))?.vetKeyEpoch ??
					0n;

				const chatIdVetKeyEpochStr = chatIdVetKeyEpochToString(chatId, BigInt(vetKeyEpoch));

				const vetKeyEpochMeta =
					chatIdVetKeyEpochStringToVetKeyEpochMetadata.get(chatIdVetKeyEpochStr);
				if (vetKeyEpochMeta?.status !== 'ready') {
					throw new Error('Failed to get vetkey epoch metadata for chat: ' + chatIdVetKeyEpochStr);
				}
				const vetKeyEpochId = vetKeyEpochMeta.metadata.epoch_id;
				const elapsedSinceVetKeyEpoch =
					BigInt(Date.now()) * 1_000_000n - vetKeyEpochMeta.metadata.creation_timestamp;
				const symmetricKeyEpoch =
					elapsedSinceVetKeyEpoch / vetKeyEpochMeta.metadata.symmetric_key_rotation_duration;

				const buf = new Uint8Array(8);
				globalThis.crypto.getRandomValues(buf);
				let messageId = 0n;
				for (const b of buf) messageId = (messageId << 8n) | BigInt(b);

				const messageContent = JSON.stringify({ content, fileData });
				const encryptedMessageContent = await encryptMessageContent(
					chatId,
					vetKeyEpochId,
					symmetricKeyEpoch,
					myPrincipal,
					new TextEncoder().encode(messageContent),
					messageId
				);

				const message: UserMessage = {
					vetkey_epoch: vetKeyEpochId,
					content: encryptedMessageContent,
					symmetric_key_epoch: symmetricKeyEpoch,
					message_id: messageId
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
				break;
			} catch (error) {
				if (error instanceof Error && error.message.startsWith('Wrong symmetric key epoch')) {
					console.info(
						`Retrying failed to send message - wrong symmetric key epoch in message: ${error.message}`
					);
					await new Promise((resolve) => setTimeout(resolve, 1000));
					repetitions++;
					continue;
				} else if (error instanceof Error && error.message.startsWith('Wrong vetKey epoch')) {
					console.info(
						`Retrying failed to send message - wrong vetKey key epoch in message: ${error.message}`
					);

					const result = await chatAPI.getLatestVetKeyEpochMetadata(actor, chatId);
					const chatIdVetKeyEpochStr = chatIdVetKeyEpochToString(chatId, BigInt(result.epoch_id));
					if (!chatIdVetKeyEpochStringToVetKeyEpochMetadata.has(chatIdVetKeyEpochStr)) {
						console.log(
							'chatIdVetKeyEpochStringToVetKeyEpochMetadata missing ',
							chatIdVetKeyEpochStr,
							' -- adding a promise to fetch it'
						);
						chatIdVetKeyEpochStringToVetKeyEpochMetadata.set(chatIdVetKeyEpochStr, {
							status: 'missing'
						});
					}
					await new Promise((resolve) => setTimeout(resolve, 1000));
					repetitions++;
					continue;
				} else if (repetitions >= MAX_RETRIES) {
					console.error('Failed to send message after ', MAX_RETRIES, ' retries:', error);
					chatActions.addNotification({
						type: 'error',
						title: 'Send Error',
						message: 'Failed to send message. Please try again.',
						isDismissible: true
					});
					break;
				} else {
					console.error('Retrying failed to send message: ', error);
					await new Promise((resolve) => setTimeout(resolve, 1000));
					repetitions++;
					continue;
				}
			}
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
	},

	async updateGroupMembers(
		chatId: ChatId,
		addUsers: Principal[],
		removeUsers: Principal[],
		// TODO: implement this
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		allowHistoryForNew: boolean
	) {
		if ('Direct' in chatId) {
			throw new Error('updateGroupMembers: chatId is a direct chat');
		}
		const actor = getActor();
		if (!actor) throw new Error('Not authenticated');
		const modification: GroupModification = {
			remove_participants: removeUsers,
			add_participants: addUsers
		};
		const result = await actor.modify_group_chat_participants(chatId.Group, modification);
		if ('Ok' in result) {
			console.log(
				`Group ${chatIdToString(chatId)} updated: +${addUsers.length}, -${removeUsers.length}, history: ${allowHistoryForNew}`
			);
		} else {
			throw new Error(result.Err);
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
		currentPrincipal && senderPrincipal === currentPrincipal
			? getMyPrincipal().toString()
			: senderPrincipal;
	const contentStr = new TextDecoder().decode(new Uint8Array(m.content));
	const contentTyped = JSON.parse(contentStr) as {
		content: string;
		fileData?: { name: string; size: number; type: string; data: ArrayBuffer };
	};
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

async function ensureVetKeyEpochMetadata(
	actor: ActorSubclass<_SERVICE>,
	chatId: ChatId,
	vetKeyEpoch: bigint
) {
	const chatIdVetKeyEpochStr = chatIdVetKeyEpochToString(chatId, vetKeyEpoch);
	console.log('ensureVetKeyEpochMetadata', chatIdVetKeyEpochStr);
	const cur = chatIdVetKeyEpochStringToVetKeyEpochMetadata.get(chatIdVetKeyEpochStr);

	if (cur?.status === 'loading') {
		if (!actor) throw new Error('Not authenticated');

		await cur.promise
			.then((metadata) => {
				// transition to ready when it resolves
				chatIdVetKeyEpochStringToVetKeyEpochMetadata.set(chatIdVetKeyEpochStr, {
					status: 'ready',
					metadata
				});
				console.log('ensureVetKeyEpochMetadata ready', chatIdVetKeyEpochStr);
				return metadata;
			})
			.catch((error) => {
				// transition to error so UI can react
				chatIdVetKeyEpochStringToVetKeyEpochMetadata.set(chatIdVetKeyEpochStr, {
					status: 'error',
					error: error instanceof Error ? error.message : 'Unknown error'
				});
				console.log('ensureVetKeyEpochMetadata error', chatIdVetKeyEpochStr);
				throw error;
			});
	} else {
		console.error('Bug: vetkey epoch metadata is not loading or ready');
	}
}

// Initialize on module load (browser only)
if (typeof window !== 'undefined') {
	void chatActions.initialize();
}
