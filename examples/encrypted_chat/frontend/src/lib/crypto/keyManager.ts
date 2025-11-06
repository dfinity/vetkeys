import { SymmetricRatchetState } from './symmetricRatchet';
import { Principal } from '@dfinity/principal';

export class KeyManager {
	#symmetricRatchetStates: Map<
		string,
		{ states: Map<bigint, SymmetricRatchetState>; stateRecoveryDuration: Date }
	> = new Map();
	#consensusTime: Date | null = null;

	constructor() {}

	ratchetVersions(): {
		chatIdStr: string;
		vetKeyEpochId: bigint;
		oldestSymmetricRatchetEpochId: bigint;
	}[] {
		const versions: {
			chatIdStr: string;
			vetKeyEpochId: bigint;
			oldestSymmetricRatchetEpochId: bigint;
		}[] = [];
		for (const [chatIdStr, { states }] of this.#symmetricRatchetStates.entries()) {
			for (const [vetKeyEpochId, symmetricRatchetState] of states.entries()) {
				versions.push({
					chatIdStr,
					vetKeyEpochId,
					oldestSymmetricRatchetEpochId: symmetricRatchetState.getCurrentEpoch()
				});
			}
		}
		return versions;
	}

	async setExpiry(chatIdStr: string, expiry: Date) {
		const map = this.#symmetricRatchetStates.get(chatIdStr);
		if (!map) {
			throw new Error(`KeyManager.setExpiry: No ratchet states found for chatId ${chatIdStr}`);
		}
		const oldExpiry = map.stateRecoveryDuration;
		map.stateRecoveryDuration = expiry;
		if (expiry > oldExpiry) {
			await this.evolveAndCleanupExpiredStates(chatIdStr);
		}
	}

	async evolveAndCleanupExpiredStates(chatIdStr: string) {
		const map = this.#symmetricRatchetStates.get(chatIdStr);
		if (!map) {
			return;
		}
		if (map.states.size === 0) {
			return;
		}
		if (this.#consensusTime === null) {
			console.warn('KeyManager.evolveAndCleanupExpiredStates: Consensus time is not set');
			return;
		}

		const recovery = map.stateRecoveryDuration;

		const keys = map.states.keys().toArray();
		for (let i = 1; i < keys.length; i++) {
			const value = map.states.get(keys[i]);
			if (!value) {
				console.error('Bug in KeyManager.evolveAndCleanupExpiredStates: Inconsistent map');
				continue;
			}

			if (value.getCreationTime().getTime() + recovery.getTime() < this.#consensusTime.getTime()) {
				map.states.delete(keys[i]);
			}
		}

		for (const [vetKeyEpochId, state] of states.entries()) {
			await state.evolveIfNeeded(new Date(consensusTime.getTime() - expiry.getTime()));
		}

		states.forEach(
			async (state) =>
				await state.evolveIfNeeded(new Date(consensusTime.getTime() - expiry.getTime()))
		);
	}

	async setConsensusTimeAndEvolveStates(time: Date) {
		if (this.#consensusTime && time < this.#consensusTime) {
			throw new Error(
				`KeyManager.setConsensusTimestamp: Timestamp ${time.toISOString()} is before the current consensus timestamp ${this.#consensusTime.toISOString()}`
			);
		}
		this.#consensusTime = time;
		await this.#evolveRatchetStatesIfNeeded();
	}

	async #evolveRatchetStatesIfNeeded() {
		if (!this.#consensusTime) {
			return;
		}
		for (const chatStates of this.#symmetricRatchetStates.values()) {
			for (const [, state] of chatStates) {
				await state.evolveIfNeeded(this.#consensusTime);
			}
		}
		// TODO: Implement
		// This should be called when consensus timestamp changes. Not necessarily on every change though, although it generally makes sense to do so.
		// We need to update the symmetric ratchet states if they are too old.
	}

	getCurrentChatIdStrs(): string[] {
		return Array.from(this.#symmetricRatchetStates.keys());
	}

	inductSymmetricRatchetState(chatId: string, vetKeyEpoch: bigint, state: SymmetricRatchetState) {
		if (this.#symmetricRatchetStates.get(chatId)?.has(vetKeyEpoch)) {
			throw new Error(
				`KeyManager.inductState: Symmetric ratchet state for chatId ${chatId} and vetKeyEpoch ${vetKeyEpoch} already exists`
			);
		}
		console.log(
			`KeyManager.inductState: Inducting state for chatId ${chatId} and vetKeyEpoch ${vetKeyEpoch} with creation time ${state.getCreationTime().toUTCString()} and ratchet epoch ${state.getCurrentEpoch().toString()}`
		);
		this.#symmetricRatchetStates.set(chatId, new Map([[vetKeyEpoch, state]]));
	}

	async encryptNow(
		chatId: string,
		sender: Principal,
		senderMessageId: bigint,
		message: Uint8Array
	): Promise<{ encryptedBytes: Uint8Array; vetKeyEpoch: bigint; symmetricRatchetEpoch: bigint }> {
		const { vetKeyEpoch, symmetricRatchetState } = this.lastVetKeyEpoch(chatId);
		const { encryptedBytes, symmetricRatchetEpoch } = await symmetricRatchetState.encryptNow(
			sender,
			senderMessageId,
			message
		);

		return { encryptedBytes, vetKeyEpoch, symmetricRatchetEpoch };
	}

	async decryptAtTimeAndEvolveIfNeeded(
		chatId: string,
		sender: Principal,
		senderMessageId: bigint,
		vetKeyEpoch: bigint,
		encryptedBytes: Uint8Array,
		time: Date
	): Promise<Uint8Array> {
		const symmetricRatchetState = this.#symmetricRatchetStates.get(chatId)?.get(vetKeyEpoch);
		if (!symmetricRatchetState) {
			throw new Error(
				`KeyManager.decryptAtTimeAndEvolveIfNeeded: No symmetric ratchet states found for chatId ${chatId} and vetKeyEpoch ${vetKeyEpoch}`
			);
		}
		return await symmetricRatchetState.decryptAtTime(sender, senderMessageId, encryptedBytes, time);
	}

	doesChatHaveKeys(chatId: string): boolean {
		return this.#symmetricRatchetStates.has(chatId);
	}

	doesChatHaveRatchetStateForEpoch(chatId: string, vetKeyEpoch: bigint): boolean {
		return this.#symmetricRatchetStates.get(chatId)?.has(vetKeyEpoch) ?? false;
	}

	private lastVetKeyEpoch(chatId: string): {
		vetKeyEpoch: bigint;
		symmetricRatchetState: SymmetricRatchetState;
	} {
		const chatIdEpochStates = this.#symmetricRatchetStates.get(chatId);
		if (!chatIdEpochStates) {
			throw new Error(
				`KeyManager.lastVetKeyEpoch: No symmetric ratchet states found for chatId ${chatId}`
			);
		}
		let last = null;

		for (const [vetKeyEpoch, symmetricRatchetState] of chatIdEpochStates.entries()) {
			if (last === null || vetKeyEpoch > last.vetKeyEpoch) {
				last = { vetKeyEpoch, symmetricRatchetState };
			}
		}
		if (last === null) {
			throw new Error(
				`Bug: KeyManager.lastVetKeyEpoch: chatIdEpochStates.size === 0 for chatId ${chatId}`
			);
		}
		return last;
	}
}
