import type { ChatId, _SERVICE } from '../../declarations/encrypted_chat/encrypted_chat.did';
import { Principal } from '@dfinity/principal';
import {
	EncryptedMaps,
	type AccessRights,
	type ByteBuf,
	type EncryptedMapData,
	type EncryptedMapsClient
} from '@dfinity/vetkeys/encrypted_maps';
import type { ActorSubclass } from '@dfinity/agent';
import {
	chatIdToString,
	stringifyBigInt,
	u8ByteUint8ArrayBigEndianToUBigInt,
	uBigIntTo8ByteUint8ArrayBigEndian
} from '$lib/utils';

export interface User {
	id: Principal;
	name: string;
	avatar?: string;
	isOnline: boolean;
	lastSeen?: Date;
}

export interface Message {
	id: string;
	chatId: string;
	senderId: string;
	content: string;
	timestamp: Date;
	type: 'text' | 'file' | 'image';
	fileData?: {
		name: string;
		size: number;
		type: string;
		data: ArrayBuffer;
	};
	isEncrypted: boolean;
	vetkeyEpoch: number;
	symmetricRatchetEpoch: number;
}

export interface Chat {
	id: ChatId;
	name: string;
	type: 'direct' | 'group';
	// Participants are required by UI components like ChatHeader/ChatListItem
	participants: User[];
	lastMessage?: Message;
	lastActivity: Date;
	isReady: boolean;
	isUpdating: boolean;
	disappearingMessagesDuration: number; // in days, 0 = never
	keyRotationStatus: VetKeyRotationStatus;
	vetKeyEpoch: number;
	symmetricRatchetEpoch: number;
	// Some components read ratchetEpoch directly
	ratchetEpoch: number;
	unreadCount: number;
	avatar?: string;
}

export interface DirectChat extends Chat {
	type: 'direct';
	otherParticipant: User;
}

export interface GroupChat extends Chat {
	type: 'group';
	otherParticipants: User[];
	adminId?: string;
}

export interface VetKeyRotationStatus {
	lastRotation: Date;
	nextRotation: Date;
	isRotationNeeded: boolean;
	currentEpoch: number;
}

export interface SymmetricRatchetStats {
	currentEpoch: number;
	messagesInCurrentEpoch: number;
	lastRotation: Date;
	nextScheduledRotation: Date;
}

export interface UserConfig {
	cacheRetentionDays: number;
	userId: string;
	userName: string;
	userAvatar?: string;
}

export interface ChatStatus {
	isReady: boolean;
	isUpdating: boolean;
	lastSync: Date;
	additionalInfo?: string;
}

export interface FileUpload {
	file: File;
	preview?: string;
	isValid: boolean;
	error?: string;
}

export type ChatType = 'direct' | 'group';
export type MessageType = 'text' | 'file' | 'image';
export type NotificationType = 'info' | 'warning' | 'error' | 'success';

export interface Notification {
	id: string;
	type: NotificationType;
	title: string;
	message: string;
	isDismissible: boolean;
	duration?: number; // auto-dismiss after ms, undefined = manual dismiss
}

class EncryptedMapsClientForEncryptedCache implements EncryptedMapsClient {
	#actor: ActorSubclass<_SERVICE>;

	constructor(actor: ActorSubclass<_SERVICE>) {
		this.#actor = actor;
	}

	get_accessible_shared_map_names(): Promise<[Principal, ByteBuf][]> {
		throw Error('unavailable EncryptedMaps function get_accessible_shared_map_names');
	}

	get_shared_user_access_for_map(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		owner: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapName: ByteBuf
	): Promise<{ Ok: Array<[Principal, AccessRights]> } | { Err: string }> {
		throw Error('unavailable EncryptedMaps function get_shared_user_access_for_map');
	}

	get_owned_non_empty_map_names(): Promise<Array<ByteBuf>> {
		throw Error('unavailable EncryptedMaps function get_owned_non_empty_map_names');
	}

	get_all_accessible_encrypted_values(): Promise<[[Principal, ByteBuf], [ByteBuf, ByteBuf][]][]> {
		throw Error('unavailable EncryptedMaps function get_all_accessible_encrypted_values');
	}

	get_all_accessible_encrypted_maps(): Promise<Array<EncryptedMapData>> {
		throw Error('unavailable EncryptedMaps function get_all_accessible_encrypted_maps');
	}

	get_encrypted_value(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapOwner: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapName: ByteBuf,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapKey: ByteBuf
	): Promise<{ Ok: [] | [ByteBuf] } | { Err: string }> {
		throw Error('unavailable EncryptedMaps function get_encrypted_value');
	}

	get_encrypted_values_for_map(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapOwner: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapName: ByteBuf
	): Promise<{ Ok: Array<[ByteBuf, ByteBuf]> } | { Err: string }> {
		throw Error('unavailable EncryptedMaps function get_encrypted_values_for_map');
	}

	async get_encrypted_vetkey(
		mapOwner: Principal,
		mapName: ByteBuf,
		transportKey: ByteBuf
	): Promise<{ Ok: ByteBuf } | { Err: string }> {
		const data = new Uint8Array(
			await this.#actor.get_encrypted_vetkey_for_my_cache_storage(transportKey.inner)
		);
		const result: { Ok: ByteBuf } | { Err: string } = {
			Ok: { inner: data }
		};
		if (data.length !== 192) {
			console.error(`get_encrypted_value: invalid data length: expected 192, got ${data.length}`);
		}
		if (result.Ok.inner.length !== 192) {
			console.error(
				`get_encrypted_value: invalid data length: expected 192, got ${result.Ok.inner.length}`
			);
		}
		if ('Ok' in result) {
			console.log(
				`get_encrypted_vetkey: size=${result.Ok.inner.length}, value=${JSON.stringify(result.Ok.inner)}`
			);
		}
		return Promise.resolve(result);
	}

	insert_encrypted_value(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapOwner: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapName: ByteBuf,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapKey: ByteBuf,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		data: ByteBuf
	): Promise<{ Ok: [] | [ByteBuf] } | { Err: string }> {
		throw Error('unavailable EncryptedMaps function insert_encrypted_value');
	}

	remove_encrypted_value(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapOwner: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapName: ByteBuf,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapKey: ByteBuf
	): Promise<{ Ok: [] | [ByteBuf] } | { Err: string }> {
		throw Error('unavailable EncryptedMaps function remove_encrypted_value');
	}

	remove_map_values(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapOwner: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapName: ByteBuf
	): Promise<{ Ok: Array<ByteBuf> } | { Err: string }> {
		throw Error('unavailable EncryptedMaps function remove_map_values');
	}

	async get_vetkey_verification_key(): Promise<ByteBuf> {
		return { inner: await this.#actor.get_vetkey_verification_key_for_my_cache_storage() };
	}

	set_user_rights(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		owner: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapName: ByteBuf,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		user: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		userRights: AccessRights
	): Promise<{ Ok: [] | [AccessRights] } | { Err: string }> {
		throw Error('unavailable EncryptedMaps function set_user_rights');
	}

	get_user_rights(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		owner: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapName: ByteBuf,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		user: Principal
	): Promise<{ Ok: [] | [AccessRights] } | { Err: string }> {
		throw Error('unavailable EncryptedMaps function get_user_rights');
	}

	remove_user(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		owner: Principal,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		mapName: ByteBuf,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		user: Principal
	): Promise<{ Ok: [] | [AccessRights] } | { Err: string }> {
		throw Error('unavailable EncryptedMaps function remove_user');
	}
}

function mapName(): Uint8Array {
	return new TextEncoder().encode('encrypted_chat_cache');
}

async function mapKeyId(chat_id: ChatId, vetkey_epoch_id: bigint): Promise<Uint8Array> {
	const input = serializeChatId(chat_id);

	const hashBuffer = await crypto.subtle.digest(
		'SHA-256',
		new Uint8Array([...input, ...uBigIntTo8ByteUint8ArrayBigEndian(vetkey_epoch_id)])
	);
	return new Uint8Array(hashBuffer);
}

function serializeChatId(chatId: ChatId): Uint8Array {
	if ('Direct' in chatId) {
		return new Uint8Array([
			0,
			...chatId.Direct[0].toUint8Array(),
			...chatId.Direct[1].toUint8Array()
		]);
	} else {
		return new Uint8Array([1, ...uBigIntTo8ByteUint8ArrayBigEndian(chatId.Group)]);
	}
}

export class VetKeyEncryptedCache {
	#encryptedMaps: EncryptedMaps;
	#myPrincipal: Principal;
	#actor: ActorSubclass<_SERVICE>;

	constructor(myPrincipal: Principal, actor: ActorSubclass<_SERVICE>) {
		this.#myPrincipal = myPrincipal;
		this.#encryptedMaps = new EncryptedMaps(new EncryptedMapsClientForEncryptedCache(actor));
		this.#actor = actor;
	}

	async fetchAndDecryptFor(
		chatId: ChatId,
		vetKeyEpoch: bigint
	): Promise<{ keyBytes: Uint8Array; symmetricKeyEpoch: bigint }> {
		const keyCacheBytes = await this.#actor.get_my_symmetric_key_cache(chatId, vetKeyEpoch);
		if ('Err' in keyCacheBytes) {
			throw new Error('Failed to get key cache bytes: ' + keyCacheBytes.Err);
		} else if (keyCacheBytes.Ok.length === 0) {
			throw new Error('Failed to get key cache bytes: no key cache found');
		}

		const mapName_ = mapName();
		const mapKey = await mapKeyId(chatId, vetKeyEpoch);
		const decryptedBytes = await this.#encryptedMaps.decryptFor(
			this.#myPrincipal,
			mapName_,
			mapKey,
			new Uint8Array(keyCacheBytes.Ok[0])
		);

		console.log(
			`VetKeyEncryptedCache: successfully fetched and decrypted key cache for chatId=${chatIdToString(chatId)} vetKeyEpoch=${vetKeyEpoch.toString()}: ${stringifyBigInt(deserializeCache(decryptedBytes))}`
		);
		return deserializeCache(decryptedBytes);
	}

	async encryptAndStoreFor(
		chatId: ChatId,
		vetKeyEpoch: bigint,
		cache: { keyBytes: Uint8Array; symmetricKeyEpoch: bigint }
	): Promise<void> {
		console.log('encryptAndStoreFor: starting to store the root key in cache: ', cache);
		const mapName_ = mapName();
		const mapKey = await mapKeyId(chatId, vetKeyEpoch);

		const ciphertext = await this.#encryptedMaps.encryptFor(
			this.#myPrincipal,
			mapName_,
			mapKey,
			serializeCache(cache)
		);
		const result = await this.#actor.update_my_symmetric_key_cache(chatId, vetKeyEpoch, ciphertext);
		if ('Err' in result) {
			throw new Error('Failed to update key cache: ' + result.Err);
		} else {
			console.log(
				`VetKeyEncryptedCache: successfully stored key cache for chatId=${chatIdToString(chatId)} vetKeyEpoch=${vetKeyEpoch.toString()}: ${stringifyBigInt(serializeCache(cache))}`
			);
		}
	}
}

function serializeCache(cache: { keyBytes: Uint8Array; symmetricKeyEpoch: bigint }): Uint8Array {
	return new Uint8Array([
		...cache.keyBytes,
		...uBigIntTo8ByteUint8ArrayBigEndian(cache.symmetricKeyEpoch)
	]);
}

function deserializeCache(data: Uint8Array): { keyBytes: Uint8Array; symmetricKeyEpoch: bigint } {
	return {
		keyBytes: data.slice(0, 32),
		symmetricKeyEpoch: u8ByteUint8ArrayBigEndianToUBigInt(data.slice(32))
	};
}
