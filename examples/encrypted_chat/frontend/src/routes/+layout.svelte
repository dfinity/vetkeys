<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import NotificationBanner from '$lib/components/NotificationBanner.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app">
	<!-- Global notifications -->
	<NotificationBanner />

	<!-- Main content -->
	{@render children?.()}
</div>

<style>
	.app {
		height: 100vh;
		height: 100dvh; /* For mobile browsers */
		overflow: hidden;
	}
</style>
