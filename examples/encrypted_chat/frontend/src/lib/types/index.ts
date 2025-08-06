export interface User {
	id: string;
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
	ratchetEpoch: number;
}

export interface Chat {
	id: string;
	name: string;
	type: 'direct' | 'group';
	participants: User[];
	lastMessage?: Message;
	lastActivity: Date;
	isReady: boolean;
	isUpdating: boolean;
	disappearingMessagesDuration: number; // in days, 0 = never
	keyRotationStatus: KeyRotationStatus;
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
	adminId: string;
	canModify: boolean;
	allowHistoryForNewMembers: boolean;
}

export interface KeyRotationStatus {
	lastRotation: Date;
	nextRotation: Date;
	isRotationNeeded: boolean;
	currentEpoch: number;
}

export interface RatchetStats {
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
