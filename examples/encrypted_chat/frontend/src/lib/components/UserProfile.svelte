<script lang="ts">
	import { Settings } from 'lucide-svelte';
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

	{#if showConfig}
		<div class="config-panel bg-surface-200-700-token mt-4 rounded-lg p-3">
			<h4 class="mb-3 text-sm font-semibold">Configuration</h4>

			<div class="space-y-4">
				<div>
					<label for="cache-retention" class="mb-1 block text-sm font-medium">
						Cache Retention (days)
					</label>
					<input
						id="cache-retention"
						type="number"
						min="1"
						max="365"
						bind:value={configForm.cacheRetentionDays}
						class="input w-full"
						placeholder="7"
					/>
					<p class="text-surface-600-300-token mt-1 text-xs">
						How often to remove user's cache data
					</p>
				</div>
			</div>

			<div class="mt-4 flex gap-2">
				<button class="variant-filled-primary btn flex-1" on:click={saveConfig}> Save </button>
				<button class="variant-ghost-surface btn flex-1" on:click={() => (showConfig = false)}>
					Cancel
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.user-profile {
		background: var(--color-surface-100);
	}

	:global(.dark) .user-profile {
		background: var(--color-surface-800);
	}
</style>
