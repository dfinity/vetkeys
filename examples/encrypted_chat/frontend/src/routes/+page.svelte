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

	.chat-container {
		background: var(--color-surface-50);
	}

	:global(.dark) .chat-container {
		background: var(--color-surface-900);
	}

	.chat-list-wrapper {
		position: relative;
		z-index: 10;
	}

	.chat-interface-wrapper {
		position: relative;
		z-index: 5;
	}

	@media (max-width: 767px) {
		.chat-list-wrapper {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 20;
		}

		.chat-interface-wrapper {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 10;
		}
	}

	.loading-screen {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
	}
</style>