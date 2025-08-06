<script lang="ts">
	import { chats, selectedChatId, chatActions } from '../stores/chat';
	import ChatListItem from './ChatListItem.svelte';
	import UserProfile from './UserProfile.svelte';

	function handleChatSelect(event: CustomEvent<string>) {
		const chatId = event.detail;
		chatActions.selectChat(chatId);

		// Load messages for the selected chat
		chatActions.loadChatMessages(chatId);
	}
</script>

<div
	class="chat-list bg-surface-50-900-token border-surface-300-600-token flex h-full flex-col border-r"
>
	<!-- User Profile -->
	<UserProfile />

	<!-- Chat List Header -->
	<div class="border-surface-300-600-token border-b p-4">
		<h2 class="text-lg font-bold">Chats</h2>
		<p class="text-surface-600-300-token text-sm">
			{$chats.length} conversation{$chats.length !== 1 ? 's' : ''}
		</p>
	</div>

	<!-- Chat List -->
	<div class="scrollbar-thin flex-1 overflow-y-auto">
		{#each $chats as chat (chat.id)}
			<ChatListItem {chat} isSelected={$selectedChatId === chat.id} on:select={handleChatSelect} />
		{:else}
			<div class="p-8 text-center text-surface-600-300-token">
				<p class="text-lg mb-2">No chats yet</p>
				<p class="text-sm">Your conversations will appear here</p>
			</div>
		{/each}
	</div>
</div>

<style>
	.chat-list {
		width: 320px;
		min-width: 280px;
	}

	@media (max-width: 768px) {
		.chat-list {
			width: 100%;
			min-width: 100%;
		}
	}
</style>
