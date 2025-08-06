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
	<div class="loading-screen bg-surface-100-800-token flex h-full items-center justify-center">
		<div class="text-center">
			<div
				class="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"
			></div>
			<h2 class="mb-2 text-lg font-semibold">Loading VetKeys Chat</h2>
			<p class="text-surface-600-300-token">Initializing secure communication...</p>
		</div>
	</div>
{:else}
	<!-- Main chat interface -->
	<div class="chat-container flex h-full">
		<!-- Chat List Sidebar (Desktop) or Full Screen (Mobile) -->
		<div class="chat-list-wrapper {isMobile ? (showMobileChatList ? 'block' : 'hidden') : 'block'}">
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