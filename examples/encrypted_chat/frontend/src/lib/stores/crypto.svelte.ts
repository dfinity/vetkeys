import {
	chatIdToString,
	chatIdVetKeyEpochToString,
	sizePrefixedBytesFromString,
	stringifyBigInt,
	uBigIntTo8ByteUint8ArrayBigEndian
} from '$lib/utils';
import { Principal } from '@dfinity/principal';
import {
	DerivedKeyMaterial,
	DerivedPublicKey,
	deriveSymmetricKey,
	EncryptedVetKey,
	IbeCiphertext,
	IbeIdentity,
	IbeSeed,
	TransportSecretKey
} from '@dfinity/vetkeys';
import type { _SERVICE, ChatId } from '../../declarations/encrypted_chat/encrypted_chat.did';
import { SvelteMap } from 'svelte/reactivity';
import type { ActorSubclass } from '@dfinity/agent';
import { getMyPrincipal } from './auth.svelte';
import { EncryptedCacheManager } from '../types';
import { keyStorageService } from '$lib/services/keyStorage';

const DOMAIN_RATCHET_INIT = sizePrefixedBytesFromString('ic-vetkeys-chat-example-ratchet-init');
const DOMAIN_RATCHET_STEP = sizePrefixedBytesFromString('ic-vetkeys-chat-example-ratchet-step');
const DOMAIN_MESSAGE_ENCRYPTION = sizePrefixedBytesFromString(
	'ic-vetkeys-chat-example-message-encryption'
);

type KeyState =
	| { status: 'missing' }
	| { status: 'loading'; promise: Promise<{ key: CryptoKey; symmetricKeyEpoch: bigint }> }
	| { status: 'ready'; symmetricKeyEpoch: bigint; key: CryptoKey }
	| { status: 'error'; error: string };

export const chatIdStringToEpochKeyState = new SvelteMap<string, KeyState>();

export async function ensureSymmetricKeyState(chatId: ChatId, epochId: bigint) {
	const chatIdStr = chatIdToString(chatId);
	const mapKey = `${chatIdStr}/${epochId.toString()}`;
	const cur = chatIdStringToEpochKeyState.get(mapKey);

	if (cur?.status === 'loading') {
		await cur.promise
			.then(({ key, symmetricKeyEpoch }) => {
				console.log('ensureRootKey ready', chatIdStr);
				chatIdStringToEpochKeyState.set(mapKey, {
					status: 'ready',
					symmetricKeyEpoch,
					key
				});
			})
			.catch((error) => {
				console.log('ensureRootKey error', chatIdStr);
				chatIdStringToEpochKeyState.set(mapKey, {
					status: 'error',
					error: error instanceof Error ? error.message : 'Unknown error'
				});
				throw error;
			});
	} else {
		console.error(
			'Bug: ensureSymmetricKeyState: chatIdStrVetKeyEpoch: ',
			chatIdStr,
			' should be loading but instead is ',
			cur?.status
		);
	}
}

async function getCurrentSymmetricEpoch(chatId: ChatId, vetkeyEpoch: bigint): Promise<bigint> {
	const mapKey = chatIdVetKeyEpochToString(chatId, vetkeyEpoch);
	console.log(
		`getCurrentSymmetricEpoch: ${chatIdToString(chatId)} vetkeyEpoch: ${vetkeyEpoch.toString()}`
	);
	while (true) {
		console.log('getCurrentSymmetricEpoch: waiting for vetKey state in a loop');
		const cur = chatIdStringToEpochKeyState.get(mapKey);
		if (cur === undefined) {
			console.log(
				`getCurrentSymmetricEpoch: no vetKey state for ${vetkeyEpoch.toString()} for chat ${chatIdToString(chatId)} in  chatIdStringToEpochKeyState -- adding a missing entry`
			);
			chatIdStringToEpochKeyState.set(mapKey, {
				status: 'missing'
			});
		} else if (cur.status === 'ready') {
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
	const mapKey = chatIdVetKeyEpochToString(chatId, vetkeyEpoch);
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
				throw new Error('Failed to send message: failed to get epoch key after 30 seconds');
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	if (!cur) {
		throw new Error('getSymmetricEpochKey: bug: failed to get epoch key: ' + mapKey);
	}

	const { key, symmetricKeyEpoch: symmetricKeyEpochKeyState } = cur;

	if (symmetricKeyEpochKeyState !== symmetricKeyEpoch) {
		throw new Error(
			`Failed to send message: wrong symmetric key epoch in message: expected ${symmetricKeyEpoch} but got ${symmetricKeyEpochKeyState}`
		);
	}

	return DerivedKeyMaterial.fromCryptoKey(key);
}

export async function reshareIbeEncryptedVetKeys(
	actor: ActorSubclass<_SERVICE>,
	chatId: ChatId,
	vetkeyEpoch: bigint,
	otherParticipants: Principal[],
	vetKeyBytes: Uint8Array
): Promise<void> {
	if (otherParticipants.length > 0) {
		console.log(
			'reshareIbeEncryptedVetkeys: ',
			chatId,
			vetkeyEpoch,
			otherParticipants,
			vetKeyBytes
		);
		// try to reshare with other participants
		return await Promise.all(
			otherParticipants.map(async (p) => {
				const ibePublicKey = DerivedPublicKey.deserialize(
					new Uint8Array(await actor.get_vetkey_resharing_ibe_encryption_key(p))
				);
				const ibeIdentity = IbeIdentity.fromBytes(new Uint8Array());
				const ibeSeed = IbeSeed.random();
				const ibeCiphertext = IbeCiphertext.encrypt(
					ibePublicKey,
					ibeIdentity,
					vetKeyBytes,
					ibeSeed
				);
				const ibeCiphertextBytes = ibeCiphertext.serialize();
				const result: [Principal, Uint8Array<ArrayBufferLike>] = [p, ibeCiphertextBytes];
				return result;
			})
		).then(async (ibeEncryptedVetKeysPromise) => {
			await actor
				.reshare_ibe_encrypted_vetkeys(chatId, vetkeyEpoch, ibeEncryptedVetKeysPromise)
				.then((result) => {
					if ('Ok' in result) {
						console.log(
							`Successfully resharded IBE encrypted vetkeys for chat ${chatIdToString(chatId)} vetkeyEpoch ${vetkeyEpoch.toString()}`
						);
					} else {
						console.info(
							`Failed to reshare IBE encrypted vetkeys for chat ${chatIdToString(chatId)} vetkeyEpoch ${vetkeyEpoch.toString()}: `,
							result.Err
						);
					}
				});
		});
	} else {
		console.log('no other participants to reshare vetKey with');
	}
}

export async function fetchResharedIbeEncryptedVetKeys(
	actor: ActorSubclass<_SERVICE>,
	chatId: ChatId,
	vetkeyEpoch: bigint,
	myPrincipal: Principal
): Promise<Uint8Array> {
	console.log('fetchResharedIbeEncryptedVetKeys: ', chatId, vetkeyEpoch, myPrincipal);
	const tsk = TransportSecretKey.random();
	const myResharedIbeEncryptedVetkey = await actor.get_my_reshared_ibe_encrypted_vetkey(
		chatId,
		vetkeyEpoch
	);
	if ('Err' in myResharedIbeEncryptedVetkey) {
		throw new Error(
			'Failed to get my reshared IBE encrypted vetkey: ' + myResharedIbeEncryptedVetkey.Err
		);
	} else if (myResharedIbeEncryptedVetkey.Ok.length === 0) {
		throw new Error('Failed to get my reshared IBE encrypted vetkey: no reshared vetkey');
	}
	const ibeCiphertext = IbeCiphertext.deserialize(
		new Uint8Array(myResharedIbeEncryptedVetkey.Ok[0])
	);

	const publicIbeKeyBytes = await actor.get_vetkey_resharing_ibe_encryption_key(myPrincipal);
	const publicIbeKey = DerivedPublicKey.deserialize(new Uint8Array(publicIbeKeyBytes));

	const maybeIbeDecryptionKeyFromStorage = await keyStorageService.getIbeDecryptionKey();
	// TODO:cache this key
	const privateEncryptedIbeKeyBytes =
		maybeIbeDecryptionKeyFromStorage ??
		new Uint8Array(await actor.get_vetkey_resharing_ibe_decryption_key(tsk.publicKeyBytes()));
	if (!maybeIbeDecryptionKeyFromStorage) {
		console.log(
			`Saving IBE decryption key for chat ${chatIdToString(chatId)} vetkeyEpoch ${vetkeyEpoch.toString()}`
		);
		keyStorageService
			.saveIbeDecryptionKey(new Uint8Array(privateEncryptedIbeKeyBytes))
			.catch((error) => {
				console.error(
					`Failed to save IBE decryption key for chat ${chatIdToString(chatId)} vetkeyEpoch ${vetkeyEpoch.toString()}: `,
					error
				);
			});
	}

	const encryptedVetKey = EncryptedVetKey.deserialize(new Uint8Array(privateEncryptedIbeKeyBytes));
	const privateIbeKey = encryptedVetKey.decryptAndVerify(tsk, publicIbeKey, new Uint8Array());

	const ibePlaintext = ibeCiphertext.decrypt(privateIbeKey);
	return ibePlaintext;
}

export function deriveRootKeyAndDispatchCaching(
	actor: ActorSubclass<_SERVICE>,
	chatId: ChatId,
	vetKeyEpoch: bigint,
	vetKeyBytes: Uint8Array
): { keyBytes: Uint8Array; symmetricKeyEpoch: bigint } {
	const rootKey = deriveRootKeyBytes(vetKeyBytes);
	console.log(
		`Computed rootKey=${stringifyBigInt(rootKey)} from vetKey=${stringifyBigInt(vetKeyBytes)}`
	);

	console.log('starting to store the root key in cache: ', rootKey);
	const vetKeyEncryptedCache = new EncryptedCacheManager(getMyPrincipal(), actor);
	const keyState = { keyBytes: rootKey, symmetricKeyEpoch: 0n };
	// await this future in background
	vetKeyEncryptedCache.encryptAndStoreFor(chatId, vetKeyEpoch, keyState).catch((error) => {
		console.error(
			`Failed to store root key in cache for chat ${chatIdToString(chatId)} vetkeyEpoch ${vetKeyEpoch.toString()}: `,
			error
		);
	});
	return keyState;
}

export async function deriveNextSymmetricRatchetEpochCryptoKey(
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

async function symmetricRatchet(
	chatId: ChatId,
	vetkeyEpoch: bigint,
	expectedSymmetricKeyEpoch: bigint
) {
	const chatIdStr = chatIdToString(chatId);
	const mapKey = chatIdVetKeyEpochToString(chatId, vetkeyEpoch);
	console.log(
		`symmetricRatchet: ${chatIdStr} vetkeyEpoch: ${vetkeyEpoch.toString()} expectedSymmetricKeyEpoch: ${expectedSymmetricKeyEpoch.toString()}`
	);
	while (true) {
		console.log('symmetricRatchet: waiting for vetKey state in a loop');
		const cur = chatIdStringToEpochKeyState.get(mapKey);
		if (!cur) {
			throw new Error('Bug: failed to get epoch key');
		}
		if (cur.status === 'error') {
			throw new Error('Failed to get epoch key: ' + cur.error);
		}
		if (cur.status !== 'ready') {
			await new Promise((resolve) => setTimeout(resolve, 100));
			continue;
		}

		const { key, symmetricKeyEpoch: currentSymmetricKeyEpoch } = cur;
		if (currentSymmetricKeyEpoch !== expectedSymmetricKeyEpoch) {
			throw new Error(
				`Failed to send message: wrong symmetric key epoch in message: expected ${expectedSymmetricKeyEpoch} but got ${currentSymmetricKeyEpoch}`
			);
		}

		return await deriveNextSymmetricRatchetEpochCryptoKey(key, currentSymmetricKeyEpoch);
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
			const mapKey = chatIdVetKeyEpochToString(chatId, vetkeyEpoch);
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

async function fastForwardSymmetricRatchetWithoutSavingUntil(
	chatId: ChatId,
	currentVetkeyEpoch: bigint,
	neededSymmetricKeyEpoch: bigint
): Promise<DerivedKeyMaterial> {
	const mapKey = chatIdVetKeyEpochToString(chatId, currentVetkeyEpoch);
	const cur = chatIdStringToEpochKeyState.get(mapKey);
	if (!cur) {
		chatIdStringToEpochKeyState.set(mapKey, {
			status: 'missing'
		});
		return await fastForwardSymmetricRatchetWithoutSavingUntil(
			chatId,
			currentVetkeyEpoch,
			neededSymmetricKeyEpoch
		);
	}
	if (cur.status === 'error') {
		throw new Error('Failed to get epoch key: ' + cur.error);
	}
	if (cur.status !== 'ready') {
		throw new Error('Epoch key is not ready for symmetric ratchet');
	}
	const { key, symmetricKeyEpoch: currentSymmetricKeyEpoch } = cur;
	if (currentSymmetricKeyEpoch >= neededSymmetricKeyEpoch) {
		return DerivedKeyMaterial.fromCryptoKey(key);
	}

	let derivedKeyState = { epochKey: key, symmetricKeyEpoch: currentSymmetricKeyEpoch };
	while (derivedKeyState.symmetricKeyEpoch < neededSymmetricKeyEpoch) {
		derivedKeyState = {
			epochKey: await deriveNextSymmetricRatchetEpochCryptoKey(
				derivedKeyState.epochKey,
				derivedKeyState.symmetricKeyEpoch
			),
			symmetricKeyEpoch: derivedKeyState.symmetricKeyEpoch + 1n
		};
	}
	return DerivedKeyMaterial.fromCryptoKey(derivedKeyState.epochKey);
}

export async function encryptMessageContent(
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

export async function decryptMessageContent(
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
		console.log(
			'decryptMessageContent: advancing symmetric ratchet until symmetricKeyEpoch: ',
			symmetricKeyEpoch
		);
		await symmetricRatchetUntil(chatId, vetkeyEpoch, symmetricKeyEpoch);
	}
	const epochKey = await getSymmetricEpochKey(chatId, vetkeyEpoch, symmetricKeyEpoch);
	const domainSeparator = messageEncryptionDomainSeparator(sender, userMessageId);
	return await epochKey.decryptMessage(encryptedMessageContent, domainSeparator).catch((error) => {
		console.error(
			`decryptMessageContent: failed to decrypt message in chat ${chatIdToString(chatId)} for vetkeyEpoch ${vetkeyEpoch.toString()} and symmetricKeyEpoch: ${symmetricKeyEpoch.toString()} from sender ${sender.toText()} with userMessageId ${userMessageId.toString()}`,
			error
		);
		return new TextEncoder().encode('<decryption failed>');
	});
}

export function messageEncryptionDomainSeparator(sender: Principal, messageId: bigint): Uint8Array {
	return new Uint8Array([
		...DOMAIN_MESSAGE_ENCRYPTION,
		...sender.toUint8Array(),
		...uBigIntTo8ByteUint8ArrayBigEndian(messageId)
	]);
}

export function deriveRootKeyBytes(vetKeyBytes: Uint8Array): Uint8Array {
	return deriveSymmetricKey(vetKeyBytes, DOMAIN_RATCHET_INIT, 32);
}

export async function importKeyFromBytes(params: {
	keyBytes: Uint8Array;
	symmetricKeyEpoch: bigint;
}): Promise<{ key: CryptoKey; symmetricKeyEpoch: bigint }> {
	const exportable = false;
	const key = await globalThis.crypto.subtle.importKey(
		'raw',
		new Uint8Array(params.keyBytes),
		'HKDF',
		exportable,
		['deriveKey', 'deriveBits']
	);
	return { key, symmetricKeyEpoch: params.symmetricKeyEpoch };
}
