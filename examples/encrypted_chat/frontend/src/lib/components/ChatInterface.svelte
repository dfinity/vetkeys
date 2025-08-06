<script lang="ts">
	import { selectedChat, chatActions } from '../stores/chat';
	import ChatHeader from './ChatHeader.svelte';
	import MessageHistory from './MessageHistory.svelte';
	import MessageInput from './MessageInput.svelte';
	import type { FileUpload } from '../types';

	export let isMobile = false;
	export let onMobileBack: (() => void) | undefined = undefined;

	async function handleSendMessage(event: CustomEvent<{ content: string; file?: FileUpload }>) {
		if (!$selectedChat) return;

		const { content, file } = event.detail;

		let fileData;
		if (file && file.isValid) {
			// Convert file to array buffer for storage
			const arrayBuffer = await file.file.arrayBuffer();
			fileData = {
				name: file.file.name,
				size: file.file.size,
				type: file.file.type,
				data: arrayBuffer
			};
		}

		await chatActions.sendMessage($selectedChat.id, content, fileData);
	}
</script>

<div class="chat-interface flex h-full flex-col">
	{#if $selectedChat}
		<!-- Chat Header -->
		<ChatHeader chat={$selectedChat} showMobileBackButton={isMobile} {onMobileBack} />

		<!-- Message History -->
		<MessageHistory />

		<!-- Message Input -->
		<MessageInput
			disabled={!$selectedChat.isReady}
			placeholder={$selectedChat.isReady ? 'Type a message...' : 'Chat is not ready...'}
			on:send={handleSendMessage}
		/>
	{:else}
		<!-- No chat selected state -->
		<div class="no-chat-selected flex flex-1 items-center justify-center">
			<div class="max-w-md p-8 text-center">
				<div
					class="bg-surface-200-700-token mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full text-4xl"
				>
					💬
				</div>
				<h2 class="mb-2 text-xl font-bold">Welcome to VetKeys Chat</h2>
				<p class="text-surface-600-300-token mb-6">
					Select a conversation from the sidebar to start chatting securely with end-to-end
					encryption.
				</p>
				<div class="text-surface-600-300-token space-y-2 text-sm">
					<div class="flex items-center justify-center gap-2">
						<span>🔒</span>
						<span>End-to-end encrypted messages</span>
					</div>
					<div class="flex items-center justify-center gap-2">
						<span>🔑</span>
						<span>Automatic key rotation</span>
					</div>
					<div class="flex items-center justify-center gap-2">
						<span>⏰</span>
						<span>Disappearing messages support</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.chat-interface {
		background: var(--color-surface-50);
	}

	:global(.dark) .chat-interface {
		background: var(--color-surface-900);
	}

	.no-chat-selected {
		background: var(--color-surface-100);
	}

	:global(.dark) .no-chat-selected {
		background: var(--color-surface-800);
	}
</style>
