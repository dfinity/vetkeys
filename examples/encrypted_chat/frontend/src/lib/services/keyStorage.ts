import { storagePrefixes } from '../types';
import { get, set } from 'idb-keyval';

// IndexedDB storage service for persistent key data
export class KeyStorageService {
	async getSymmetricKeyState(
		chatIdStr: string,
		vetKeyEpochStr: string
	): Promise<{ key: CryptoKey; symmetricKeyEpoch: bigint } | undefined> {
		console.log(
			`KeyStorageService: Getting key state for chat ${chatIdStr} vetkeyEpoch ${vetKeyEpochStr}`
		);
		return await get([storagePrefixes.CHAT_EPOCH_KEY_PREFIX, chatIdStr, vetKeyEpochStr]);
	}

	async saveSymmetricKeyState(
		chatIdStr: string,
		vetKeyEpochStr: string,
		keyState: { key: CryptoKey; symmetricKeyEpoch: bigint }
	) {
		console.log(
			`KeyStorageService: Saving key state for chat ${chatIdStr} vetkeyEpoch ${vetKeyEpochStr}`
		);
		await set([storagePrefixes.CHAT_EPOCH_KEY_PREFIX, chatIdStr, vetKeyEpochStr], keyState);
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
