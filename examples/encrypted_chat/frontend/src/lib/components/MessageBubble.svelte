<script lang="ts">
	import { Download, File } from 'lucide-svelte';
	import type { Message, User } from '../types';

	export let message: Message;
	export let sender: User | null = null;
	export let isOwnMessage: boolean = false;
	export let showAvatar: boolean = true;
	export let showTimestamp: boolean = true;

	function formatTime(date: Date): string {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function downloadFile() {
		if (!message.fileData) return;

		const blob = new Blob([message.fileData.data], { type: message.fileData.type });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = message.fileData.name;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function isImageFile(type: string): boolean {
		return type.startsWith('image/');
	}

	// Convert emoji shortcodes to actual emojis (simple implementation)
	function parseEmojis(text: string): string {
		const emojiMap: { [key: string]: string } = {
			':smile:': '😊',
			':heart:': '❤️',
			':thumbs_up:': '👍',
			':fire:': '🔥',
			':rocket:': '🚀',
			':check:': '✅',
			':x:': '❌',
			':warning:': '⚠️',
			':info:': 'ℹ️',
			':question:': '❓',
			':exclamation:': '❗',
			':lock:': '🔒',
			':unlock:': '🔓',
			':key:': '🔑'
		};

		let result = text;
		for (const [shortcode, emoji] of Object.entries(emojiMap)) {
			result = result.replace(new RegExp(shortcode, 'g'), emoji);
		}
		return result;
	}
</script>

<div
	class="message-container flex gap-3 px-4 py-2 {isOwnMessage ? 'flex-row-reverse' : 'flex-row'}"
>
	<!-- Avatar -->
	{#if showAvatar && !isOwnMessage}
		<div
			class="avatar flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-500 text-sm"
		>
			{sender?.avatar || '👤'}
		</div>
	{:else if showAvatar && isOwnMessage}
		<div class="w-8"></div>
	{/if}

	<!-- Message content -->
	<div class="message-content max-w-[70%] {isOwnMessage ? 'text-right' : 'text-left'}">
		<!-- Sender name (for group chats when not own message) -->
		{#if !isOwnMessage && sender && showAvatar}
			<div class="text-surface-600-300-token mb-1 text-xs font-medium">
				{sender.name}
			</div>
		{/if}

		<!-- Message bubble -->
		<div
			class="message-bubble {isOwnMessage
				? 'own-message'
				: 'other-message'} max-w-full rounded-2xl px-3 py-2 break-words"
		>
			{#if message.type === 'text'}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<p class="text-sm whitespace-pre-wrap">{@html parseEmojis(message.content)}</p>
			{:else if message.type === 'file' && message.fileData}
				<div class="file-message">
					{#if isImageFile(message.fileData.type)}
						<div class="image-preview mb-2">
							<img
								src="data:{message.fileData.type};base64,{btoa(
									String.fromCharCode(...new Uint8Array(message.fileData.data))
								)}"
								alt={message.fileData.name}
								class="h-auto max-w-full rounded-lg"
								style="max-height: 300px;"
							/>
						</div>
					{:else}
						<div class="file-icon mb-2">
							<File class="text-surface-600-300-token mx-auto h-8 w-8" />
						</div>
					{/if}

					<div class="file-info bg-surface-100-800-token rounded p-2">
						<div class="flex items-center justify-between">
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{message.fileData.name}</p>
								<p class="text-surface-600-300-token text-xs">
									{formatFileSize(message.fileData.size)}
								</p>
							</div>
							<button
								class="variant-ghost-surface ml-2 btn-icon"
								on:click={downloadFile}
								aria-label="Download file"
							>
								<Download class="h-4 w-4" />
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Timestamp and status -->
		{#if showTimestamp}
			<div
				class="message-meta text-surface-600-300-token mt-1 text-xs {isOwnMessage
					? 'text-right'
					: 'text-left'}"
			>
				<span>{formatTime(message.timestamp)}</span>
				{#if message.isEncrypted}
					<span class="ml-1">🔒</span>
				{/if}
				<span class="ml-1 opacity-70">Epoch {message.ratchetEpoch}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.message-bubble.own-message {
		background: var(--color-primary-500);
		color: white;
	}

	.message-bubble.other-message {
		background: var(--color-surface-200);
		color: var(--color-surface-900);
	}

	:global(.dark) .message-bubble.other-message {
		background: var(--color-surface-700);
		color: var(--color-surface-100);
	}

	.file-message {
		min-width: 200px;
	}

	.message-container {
		transition: all 0.2s ease;
	}

	.message-container:hover {
		background: var(--color-surface-100);
	}

	:global(.dark) .message-container:hover {
		background: var(--color-surface-800);
	}
</style>
