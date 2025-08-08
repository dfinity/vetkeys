import type { ActorSubclass } from '@dfinity/agent';
import type { SymmetricRatchetStats } from '../types';
import type {
	_SERVICE,
	ChatId,
	EncryptedMessage,
	GroupChatMetadata,
	UserMessage,
	VetKeyEpochMetadata
} from '../../declarations/encrypted_chat/encrypted_chat.did';
import { Principal } from '@dfinity/principal';

// Dummy API service that simulates backend calls
// In real implementation, these would make actual API calls to the backend

export class ChatAPI {
	async createDirectChat(
		actor: ActorSubclass<_SERVICE>,
		receiver: Principal,
		symmetricKeyRotationDurationMinutes: bigint,
		messageExpirationDurationMinutes: bigint
	): Promise<{ creationDate: Date }> {
		const result = await actor.create_direct_chat(
			receiver,
			symmetricKeyRotationDurationMinutes,
			messageExpirationDurationMinutes
		);
		if ('Ok' in result) {
			return { creationDate: new Date(Number(result.Ok / BigInt(1_000_000))) };
		} else {
			throw new Error(result.Err);
		}
	}

	async createGroupChat(
		actor: ActorSubclass<_SERVICE>,
		otherParticipants: Principal[],
		symmetricKeyRotationDurationMinutes: bigint,
		messageExpirationDurationMinutes: bigint
	): Promise<GroupChatMetadata> {
		const result = await actor.create_group_chat(
			otherParticipants,
			symmetricKeyRotationDurationMinutes,
			messageExpirationDurationMinutes
		);
		if ('Ok' in result) {
			return result.Ok;
		} else {
			throw new Error(result.Err);
		}
	}

	async sendDirectMessage(
		actor: ActorSubclass<_SERVICE>,
		receiver: Principal,
		message: UserMessage
	): Promise<{ chatMessageId: bigint }> {
		const result = await actor.send_direct_message(message, receiver);
		if ('Ok' in result) {
			return { chatMessageId: result.Ok };
		} else {
			throw new Error(result.Err);
		}
	}

	async sendGroupMessage(
		actor: ActorSubclass<_SERVICE>,
		groupChatId: bigint,
		message: UserMessage
	): Promise<{ chatMessageId: bigint }> {
		const result = await actor.send_group_message(message, groupChatId);
		if ('Ok' in result) {
			return { chatMessageId: result.Ok };
		} else {
			throw new Error(result.Err);
		}
	}

	async getChatIdsAndCurrentNumbersOfMessages(
		actor: ActorSubclass<_SERVICE>
	): Promise<{ chatId: ChatId; numMessages: bigint }[]> {
		const chatIds = await actor.get_my_chat_ids();
		return chatIds.map(([chatId, numMessages]) => {
			return { chatId, numMessages };
		});
	}

	async getAccessibleVetKeyEpochMetadata(
		actor: ActorSubclass<_SERVICE>,
		chatId: ChatId
	): Promise<VetKeyEpochMetadata> {
		const metadata = await actor.get_latest_chat_vetkey_epoch_metadata(chatId);
		if ('Ok' in metadata) {
			return metadata.Ok;
		} else {
			throw new Error(metadata.Err);
		}
	}

	async getRatchetStats(): Promise<SymmetricRatchetStats> {
		return {
			vetKeyEpoch: Math.floor(Math.random() * 30) + 1,
			rotationDurationNs: Math.floor(Math.random() * 50) + 1,
			lastRotation: new Date(Date.now() - 1000 * 60 * 60 * Math.random() * 24),
			nextScheduledRotation: new Date(Date.now() + 1000 * 60 * 60 * Math.random() * 24)
		};
	}

	async updateGroupMembers(
		chatId: string,
		addUsers: string[],
		removeUsers: string[],
		allowHistoryForNew: boolean
	): Promise<boolean> {
		console.log(
			`Group ${chatId} updated: +${addUsers.length}, -${removeUsers.length}, history: ${allowHistoryForNew}`
		);
		return true;
	}

	async fetchEncryptedMessages(
		actor: ActorSubclass<_SERVICE>,
		chatId: ChatId,
		startId: bigint,
		limit: bigint | undefined
	): Promise<EncryptedMessage[]> {
		return await actor.get_some_messages_for_chat_starting_from(
			chatId,
			startId,
			limit ? [Number(limit)] : []
		);
	}
}

export const chatAPI = new ChatAPI();
