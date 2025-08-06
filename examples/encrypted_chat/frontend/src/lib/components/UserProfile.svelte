<script lang="ts">
	import { Settings, X, Check } from 'lucide-svelte';
	import { currentUser, userConfig, chatActions } from '../stores/chat';

	let showConfig = false;
	let configForm = {
		cacheRetentionDays: 7
	};

	$: if ($userConfig) {
		configForm.cacheRetentionDays = $userConfig.cacheRetentionDays;
	}

	function toggleConfig() {
		showConfig = !showConfig;
	}

	async function saveConfig() {
		await chatActions.updateUserConfig(configForm);
		showConfig = false;
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			showConfig = false;
		}
	}
</script>

<div class="user-profile border-surface-300-600-token border-b p-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<div
				class="avatar flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-lg"
			>
				{$currentUser?.avatar || '👤'}
			</div>
			<div>
				<h3 class="text-sm font-semibold">{$currentUser?.name || 'User'}</h3>
				<div class="flex items-center gap-1">
					<div class="h-2 w-2 rounded-full bg-success-500"></div>
					<span class="text-surface-600-300-token text-xs">Online</span>
				</div>
			</div>
		</div>
		<button class="variant-ghost-surface btn-icon" on:click={toggleConfig} aria-label="Settings">
			<Settings class="h-5 w-5" />
		</button>
	</div>

</div>

<!-- Settings Modal -->
{#if showConfig}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
		on:click={handleBackdropClick}
		role="button"
		tabindex="-1"
		on:keydown={() => {}}
	></div>

	<!-- Modal -->
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div class="config-modal bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md">
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h3>
				<button
					class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					on:click={() => (showConfig = false)}
					aria-label="Close settings"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-6 space-y-4">
				<div>
					<label for="cache-retention" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
						Cache Retention (days)
					</label>
					<input
						id="cache-retention"
						type="number"
						min="1"
						max="365"
						bind:value={configForm.cacheRetentionDays}
						class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
						placeholder="7"
					/>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						How long to keep cached data before automatic cleanup
					</p>
				</div>
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
				<button
					class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
					on:click={() => (showConfig = false)}
				>
					Cancel
				</button>
				<button
					class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
					on:click={saveConfig}
				>
					<Check class="h-4 w-4" />
					Save
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.user-profile {
		background: var(--color-surface-100);
	}

	:global(.dark) .user-profile {
		background: var(--color-surface-800);
	}

	.config-modal {
		animation: modalSlideIn 0.2s ease-out;
	}

	@keyframes modalSlideIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
