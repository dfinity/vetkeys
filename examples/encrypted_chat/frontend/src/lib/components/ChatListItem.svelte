<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Clock, Users, User, Loader2, AlertCircle, CheckCircle } from 'lucide-svelte';
	import type { Chat } from '../types';

	export let chat: Chat;
	export let isSelected = false;

	const dispatch = createEventDispatcher<{
		select: string;
	}>();

	function handleClick() {
		dispatch('select', chat.id);
	}

	function formatTime(date: Date): string {
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / (1000 * 60));
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (minutes < 1) return 'now';
		if (minutes < 60) return `${minutes}m`;
		if (hours < 24) return `${hours}h`;
		if (days < 7) return `${days}d`;
		return date.toLocaleDateString();
	}

	function getDisplayName(): string {
		if (chat.type === 'direct') {
			return chat.participants.find((p) => p.id !== 'current-user')?.name || 'Unknown';
		}
		return chat.name;
	}

	function getDisplayAvatar(): string {
		if (chat.type === 'direct') {
			return chat.participants.find((p) => p.id !== 'current-user')?.avatar || '👤';
		}
		return chat.avatar || '👥';
	}

	function getStatusColor(): string {
		if (!chat.isReady) return 'status-error';
		if (chat.isUpdating) return 'status-updating';
		return 'status-ready';
	}

	function getStatusIcon() {
		if (!chat.isReady) return AlertCircle;
		if (chat.isUpdating) return Loader2;
		return CheckCircle;
	}
</script>

<button
	class="chat-item w-full p-3 text-left overflow-hidden transition-colors duration-200 {isSelected
		? 'selected'
		: 'hover:bg-surface-100-800-token'}"
	on:click={handleClick}
>
	<div class="flex items-center gap-3">
		<!-- Avatar -->
		<div class="relative">
			<div
				class="avatar flex h-12 w-12 items-center justify-center rounded-full bg-primary-500 text-lg"
			>
				{getDisplayAvatar()}
			</div>
			<!-- Status indicator -->
			<div class="absolute -right-1 -bottom-1">
				<div class="h-4 w-4 rounded-full {getStatusColor()} flex items-center justify-center">
					<svelte:component this={getStatusIcon()} class="h-2.5 w-2.5 text-white" />
				</div>
			</div>
		</div>

		<!-- Chat info -->
		<div class="min-w-0 flex-1 overflow-hidden">
			<div class="mb-1 flex items-center justify-between">
				<h3 class="truncate text-sm font-semibold">{getDisplayName()}</h3>
				<div class="flex items-center gap-2">
					{#if chat.type === 'group'}
						<Users class="text-surface-600-300-token h-3 w-3" />
					{:else}
						<User class="text-surface-600-300-token h-3 w-3" />
					{/if}
					<span class="text-surface-600-300-token text-xs">
						{formatTime(chat.lastActivity)}
					</span>
				</div>
			</div>

			<div class="flex items-center justify-between">
				<p class="text-surface-600-300-token truncate text-sm">
					{#if chat.lastMessage}
						{chat.lastMessage.content}
					{:else}
						No messages yet
					{/if}
				</p>

				{#if chat.unreadCount > 0}
					<div
						class="unread-badge flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-500 px-2 py-1 text-xs text-white"
					>
						{chat.unreadCount > 99 ? '99+' : chat.unreadCount}
					</div>
				{/if}
			</div>

			<!-- Chat status info -->
			<div class="mt-1 flex items-center gap-2">
				{#if chat.disappearingMessagesDuration > 0}
					<div
						class="status-chip bg-surface-200-700-token flex items-center gap-1 rounded px-2 py-0.5 text-xs"
					>
						<Clock class="h-3 w-3" />
						{chat.disappearingMessagesDuration}d
					</div>
				{/if}
			</div>
		</div>
	</div>
</button>

<style>

	.chat-item {
		border-bottom: 1px solid var(--color-surface-300);
		margin: 2px 0px;
		padding: 5px 5px;
		border-radius: 12px;
		border: 1px solid var(--color-surface-200);
		transition: all 0.2s ease;
	}

	.chat-item:hover {
		background: var(--color-surface-100);
		border-color: var(--color-surface-300);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
	}

	:global(.dark) .chat-item {
		border-bottom-color: var(--color-surface-600);
		border-color: var(--color-surface-700);
	}

	:global(.dark) .chat-item:hover {
		background: var(--color-surface-700);
		border-color: var(--color-surface-600);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	.chat-item.selected {
		background: var(--color-primary-100);
		border-color: var(--color-primary-300);
		border-right: 3px solid var(--color-primary-500);
		box-shadow: 0 2px 12px rgba(59, 130, 246, 0.15);
	}

	:global(.dark) .chat-item.selected {
		background: var(--color-primary-900);
		border-color: var(--color-primary-700);
		box-shadow: 0 2px 12px rgba(59, 130, 246, 0.25);
	}

	.unread-badge {
		font-size: 10px;
		line-height: 1;
	}

	.status-chip {
		font-size: 10px;
		line-height: 1;
	}
</style>
