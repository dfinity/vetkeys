import type { ChatId } from '../../declarations/encrypted_chat/encrypted_chat.did';
import type { Principal } from '@dfinity/principal';

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
