<script lang="ts">
	import { onMount } from 'svelte';
	import ChatList from '$lib/components/ChatList.svelte';
	import ChatInterface from '$lib/components/ChatInterface.svelte';
	import { isLoading, selectedChatId } from '$lib/stores/chat';

	let showMobileChatList = false;
	let isMobile = false;

	onMount(() => {
		// Check if mobile
		const checkMobile = () => {
			isMobile = window.innerWidth < 768;
		};

		checkMobile();
		window.addEventListener('resize', checkMobile);

		return () => {
			window.removeEventListener('resize', checkMobile);
		};
	});

	function handleMobileBackToChatList() {
		showMobileChatList = true;
	}

	// Update mobile chat list visibility when chat is selected
	$: if (isMobile && $selectedChatId) {
		showMobileChatList = false;
	}
</script>

<svelte:head>
	<title>VetKeys Encrypted Chat</title>
	<meta name="description" content="Secure encrypted chat application using VetKeys" />
</svelte:head>

{#if $isLoading}
	<!-- Loading state -->
	<div class="loading-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex h-full items-center justify-center">
		<div class="text-center animate-fade-in">
			<div class="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent shadow-lg"></div>
			<h2 class="mb-3 text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Loading VetKeys Chat</h2>
			<p class="text-gray-600 dark:text-gray-400 font-medium">Initializing secure communication...</p>
			<div class="mt-4 flex justify-center space-x-1">
				<div class="h-2 w-2 bg-blue-500 rounded-full animate-bounce"></div>
				<div class="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
				<div class="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
			</div>
		</div>
	</div>
{:else}
	<!-- Main chat interface -->
	<div class="chat-container flex h-full bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
		<!-- Chat List Sidebar (Desktop) or Full Screen (Mobile) -->
		<div class="chat-list-wrapper width-full {isMobile ? (showMobileChatList ? 'block' : 'hidden') : 'block'}">
			<ChatList />
		</div>

		<!-- Chat Interface (Desktop) or Full Screen when chat selected (Mobile) -->
		<div
			class="chat-interface-wrapper flex-1 {isMobile
				? showMobileChatList
					? 'hidden'
					: 'block'
				: 'block'}"
		>
			<ChatInterface {isMobile} onMobileBack={handleMobileBackToChatList} />
		</div>
	</div>
{/if}

<style lang="postcss">
    @reference "tailwindcss";
</style>