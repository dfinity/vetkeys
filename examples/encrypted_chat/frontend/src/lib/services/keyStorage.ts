import { chatIdToString } from '$lib/utils';
import type { ChatId } from '../../declarations/encrypted_chat/encrypted_chat.did';
import { storagePrefixes } from '../types';
import { get, set } from 'idb-keyval';

// IndexedDB storage service for persistent key data
export class KeyStorageService {
	async getSymmetricKeyState(
		chat: ChatId,
		vetKeyEpoch: bigint
	): Promise<{ key: CryptoKey; symmetricKeyEpoch: bigint } | undefined> {
		console.log(
			`KeyStorageService: Getting key state for chat ${chatIdToString(chat)} vetkeyEpoch ${vetKeyEpoch.toString()}`
		);
		return await get([
			storagePrefixes.CHAT_EPOCH_KEY_PREFIX,
			chatIdToString(chat),
			vetKeyEpoch.toString()
		]);
	}

	async saveSymmetricKeyState(
		chat: ChatId,
		vetKeyEpoch: bigint,
		keyState: { key: CryptoKey; symmetricKeyEpoch: bigint }
	) {
		console.log(
			`KeyStorageService: Saving key state for chat ${chatIdToString(chat)} vetkeyEpoch ${vetKeyEpoch.toString()}`
		);
		await set(
			[storagePrefixes.CHAT_EPOCH_KEY_PREFIX, chatIdToString(chat), vetKeyEpoch.toString()],
			keyState
		);
	}

	async saveIbeDecryptionKey(keyBytes: Uint8Array) {
		console.log(`KeyStorageService: Saving IBE decryption key`);
		await set([storagePrefixes.CHAT_IBE_DECRYPTION_KEY_PREFIX], keyBytes);
	}

	async getIbeDecryptionKey(): Promise<Uint8Array | undefined> {
		console.log(`KeyStorageService: Getting IBE decryption key`);
		return await get([storagePrefixes.CHAT_IBE_DECRYPTION_KEY_PREFIX]);
	}
}

export const keyStorageService = new KeyStorageService();
