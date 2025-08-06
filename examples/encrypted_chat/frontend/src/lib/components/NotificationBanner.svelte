<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { X, AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-svelte';
	import { notifications, chatActions } from '../stores/chat';
	import { storageService } from '../services/storage';
	import type { Notification } from '../types';

	let showDisclaimer = false;

	onMount(async () => {
		const dismissed = await storageService.isDisclaimerDismissed();
		showDisclaimer = !dismissed;
	});

	async function dismissDisclaimer() {
		showDisclaimer = false;
		await storageService.setDisclaimerDismissed();
	}

	function getNotificationIcon(type: Notification['type']) {
		switch (type) {
			case 'warning':
				return AlertTriangle;
			case 'error':
				return XCircle;
			case 'success':
				return CheckCircle;
			default:
				return Info;
		}
	}

	function getNotificationColor(type: Notification['type']) {
		switch (type) {
			case 'warning':
				return 'variant-filled-warning';
			case 'error':
				return 'variant-filled-error';
			case 'success':
				return 'variant-filled-success';
			default:
				return 'variant-filled-primary';
		}
	}
</script>

<!-- Disclaimer Banner -->
{#if showDisclaimer}
	<div
		class="alert variant-filled-warning fixed top-0 right-0 left-0 z-50 rounded-none border-0 border-b"
		transition:fly={{ y: -100, duration: 300 }}
	>
		<AlertTriangle class="h-6 w-6" />
		<div class="alert-message flex-1">
			<h3 class="h4">Disclaimer</h3>
			<p>
				This sample dapp is intended exclusively for experimental purpose. You are advised not to
				use this dapp for storing your critical data such as keys or passwords.
			</p>
		</div>
		<div class="alert-actions">
			<button
				class="variant-filled btn-icon"
				on:click={dismissDisclaimer}
				aria-label="Dismiss disclaimer"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	</div>
{/if}

<!-- Notification Stack -->
<div class="fixed top-4 right-4 z-40 max-w-sm space-y-2">
	{#each $notifications as notification (notification.id)}
		<div
			class="alert {getNotificationColor(notification.type)} shadow-lg"
			transition:fly={{ x: 300, duration: 300 }}
		>
			<svelte:component this={getNotificationIcon(notification.type)} class="h-5 w-5" />
			<div class="alert-message flex-1">
				<h4 class="font-semibold">{notification.title}</h4>
				<p class="text-sm opacity-90">{notification.message}</p>
			</div>
			{#if notification.isDismissible}
				<div class="alert-actions">
					<button
						class="variant-soft btn-icon"
						on:click={() => chatActions.dismissNotification(notification.id)}
						aria-label="Dismiss notification"
					>
						<X class="h-4 w-4" />
					</button>
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.alert {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 0.5rem;
	}

	.alert-message {
		flex: 1 1 0%;
		min-width: 0;
	}

	.alert-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>
