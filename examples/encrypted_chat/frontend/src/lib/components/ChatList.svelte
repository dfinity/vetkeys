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
	class="chat-list glass-effect flex h-full flex-col border-r border-white/20 backdrop-blur-xl"
>
	<!-- User Profile -->
	<UserProfile />

	<!-- Chat List Header -->
	<div class="border-b border-white/10 p-6">
		<h2 class="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Chats</h2>
		<p class="text-gray-500 dark:text-gray-400 text-sm font-medium mt-1">
			{$chats.length} conversation{$chats.length !== 1 ? 's' : ''}
		</p>
	</div>

	<!-- Chat List -->
	<div class="scrollbar-thin flex-1 overflow-y-auto p-2">
		{#each $chats as chat (chat.id)}
			<ChatListItem {chat} isSelected={$selectedChatId === chat.id} on:select={handleChatSelect} />
		{:else}
			<div class="p-8 text-center text-surface-600-500">
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
			width: 50%;
			min-width: 50%;
		}
	}
</style>
