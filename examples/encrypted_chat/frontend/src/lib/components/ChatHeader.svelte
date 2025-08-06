<script lang="ts">
	import { Settings, RotateCcw, Info, ArrowLeft } from 'lucide-svelte';
	import type { Chat, RatchetStats } from '../types';
	import { chatAPI } from '../services/api';
	import { chatActions } from '../stores/chat';
	import GroupManagementModal from './GroupManagementModal.svelte';

	export let chat: Chat;
	export let showMobileBackButton = false;
	export let onMobileBack: (() => void) | undefined = undefined;

	let showChatInfo = false;
	let ratchetStats: RatchetStats | null = null;
	let loadingRatchetStats = false;
	let showGroupManagement = false;

	async function handleChatInfoToggle() {
		showChatInfo = !showChatInfo;
		if (showChatInfo && !ratchetStats && !loadingRatchetStats) {
			await loadRatchetStats();
		}
	}

	async function loadRatchetStats() {
		if (!chat) return;

		loadingRatchetStats = true;
		try {
			ratchetStats = await chatAPI.getRatchetStats(chat.id);
		} catch (error) {
			console.error('Failed to load ratchet stats:', error);
		} finally {
			loadingRatchetStats = false;
		}
	}

	function getDisplayName(): string {
		if (chat.type === 'direct') {
			return chat.participants.find((p) => p.id !== 'current-user')?.name || 'Unknown';
		}
		return chat.name;
	}

	function getDisplayAvatar(): string {
		if (chat.type === 'direct') {
			return chat.participants.find((p) => p.id !== 'current-user')?.avatar || '👤';
		}
		return chat.avatar || '👥';
	}

	function getOnlineStatus(): string {
		if (chat.type === 'direct') {
			const otherUser = chat.participants.find((p) => p.id !== 'current-user');
			if (otherUser?.isOnline) return 'Online';
			if (otherUser?.lastSeen) {
				const lastSeen = new Date(otherUser.lastSeen);
				const diff = Date.now() - lastSeen.getTime();
				const hours = Math.floor(diff / (1000 * 60 * 60));
				const days = Math.floor(diff / (1000 * 60 * 60 * 24));

				if (hours < 1) return 'Last seen recently';
				if (hours < 24) return `Last seen ${hours}h ago`;
				return `Last seen ${days}d ago`;
			}
			return 'Offline';
		}
		const onlineCount = chat.participants.filter((p) => p.isOnline).length;
		return `${onlineCount} of ${chat.participants.length} online`;
	}

	async function rotateKeys() {
		await chatActions.rotateKeys(chat.id);
		// Reload ratchet stats after rotation
		ratchetStats = null;
		await loadRatchetStats();
	}

	function formatDate(date: Date): string {
		return date.toLocaleString();
	}

	async function handleGroupManagementSave(
		event: CustomEvent<{ addUsers: string[]; removeUsers: string[]; allowHistoryForNew: boolean }>
	) {
		const { addUsers, removeUsers, allowHistoryForNew } = event.detail;

		try {
			await chatAPI.updateGroupMembers(chat.id, addUsers, removeUsers, allowHistoryForNew);

			chatActions.addNotification({
				type: 'success',
				title: 'Group Updated',
				message: `Successfully updated group membership.`,
				isDismissible: true,
				duration: 3000
			});

			// Here you would typically reload the chat data
			// For now, we'll just show a success message
		} catch (error) {
			console.error('Failed to update group:', error);
			chatActions.addNotification({
				type: 'error',
				title: 'Update Failed',
				message: 'Failed to update group membership. Please try again.',
				isDismissible: true
			});
		}
	}
</script>

<div class="chat-header bg-surface-100-800-token border-surface-300-600-token border-b p-4">
	<div class="flex items-center justify-between">
		<!-- Chat info -->
		<div class="flex items-center gap-3">
			<!-- Mobile back button -->
			{#if showMobileBackButton}
				<button
					class="variant-ghost-surface btn-icon md:hidden"
					on:click={onMobileBack}
					aria-label="Back to chat list"
				>
					<ArrowLeft class="h-5 w-5" />
				</button>
			{/if}
			<div
				class="avatar flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-lg"
			>
				{getDisplayAvatar()}
			</div>
			<div>
				<h2 class="text-lg font-semibold">{getDisplayName()}</h2>
				<p class="text-surface-600-300-token text-sm">{getOnlineStatus()}</p>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2">
			{#if chat.keyRotationStatus.isRotationNeeded}
				<button
					class="variant-filled-warning btn"
					on:click={rotateKeys}
					disabled={chat.isUpdating}
					title="Rotate encryption keys"
				>
					<RotateCcw class="h-4 w-4 {chat.isUpdating ? 'animate-spin' : ''}" />
					Rotate Keys
				</button>
			{/if}

			<button
				class="variant-ghost-surface btn-icon"
				on:click={handleChatInfoToggle}
				title="Chat information"
			>
				<Info class="h-5 w-5" />
			</button>

			{#if chat.type === 'group'}
				<button
					class="variant-ghost-surface btn-icon"
					on:click={() => (showGroupManagement = true)}
					title="Manage group"
				>
					<Settings class="h-5 w-5" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Chat info panel -->
	{#if showChatInfo}
		<div class="chat-info bg-surface-200-700-token mt-4 rounded-lg p-4">
			<h3 class="mb-3 font-semibold">Chat Information</h3>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<!-- Basic info -->
				<div>
					<h4 class="mb-2 font-medium">Details</h4>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-surface-600-300-token">Type:</span>
							<span class="capitalize">{chat.type}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-600-300-token">Participants:</span>
							<span>{chat.participants.length}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-600-300-token">Disappearing messages:</span>
							<span
								>{chat.disappearingMessagesDuration === 0
									? 'Disabled'
									: `${chat.disappearingMessagesDuration} days`}</span
							>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-600-300-token">Status:</span>
							<span class="flex items-center gap-1">
								<div
									class="h-2 w-2 rounded-full {chat.isReady ? 'bg-success-500' : 'bg-error-500'}"
								></div>
								{chat.isReady ? 'Ready' : 'Not ready'}
							</span>
						</div>
					</div>
				</div>

				<!-- Encryption info -->
				<div>
					<h4 class="mb-2 font-medium">Encryption</h4>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-surface-600-300-token">Ratchet epoch:</span>
							<span>{chat.ratchetEpoch}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-600-300-token">Last key rotation:</span>
							<span>{formatDate(chat.keyRotationStatus.lastRotation)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-600-300-token">Next rotation:</span>
							<span>{formatDate(chat.keyRotationStatus.nextRotation)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-600-300-token">Rotation needed:</span>
							<span
								class="text-{chat.keyRotationStatus.isRotationNeeded ? 'warning' : 'success'}-500"
							>
								{chat.keyRotationStatus.isRotationNeeded ? 'Yes' : 'No'}
							</span>
						</div>
					</div>
				</div>

				<!-- Ratchet statistics -->
				{#if ratchetStats}
					<div class="col-span-full">
						<h4 class="mb-2 font-medium">Ratchet Statistics</h4>
						<div class="grid grid-cols-2 gap-4 text-sm">
							<div class="flex justify-between">
								<span class="text-surface-600-300-token">Current epoch:</span>
								<span>{ratchetStats.currentEpoch}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-surface-600-300-token">Messages in epoch:</span>
								<span>{ratchetStats.messagesInCurrentEpoch}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-surface-600-300-token">Last rotation:</span>
								<span>{formatDate(ratchetStats.lastRotation)}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-surface-600-300-token">Next scheduled:</span>
								<span>{formatDate(ratchetStats.nextScheduledRotation)}</span>
							</div>
						</div>
					</div>
				{:else if loadingRatchetStats}
					<div class="col-span-full flex items-center justify-center py-4">
						<div class="flex items-center gap-2">
							<RotateCcw class="h-4 w-4 animate-spin" />
							<span class="text-sm">Loading ratchet statistics...</span>
						</div>
					</div>
				{/if}

				<!-- Participants (for group chats) -->
				{#if chat.type === 'group'}
					<div class="col-span-full">
						<h4 class="mb-2 font-medium">Participants</h4>
						<div class="space-y-2">
							{#each chat.participants as participant (participant.id)}
								<div class="flex items-center gap-2 text-sm">
									<div
										class="avatar flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-xs"
									>
										{participant.avatar || '👤'}
									</div>
									<span class="flex-1">{participant.name}</span>
									<div class="flex items-center gap-1">
										<div
											class="h-2 w-2 rounded-full {participant.isOnline
												? 'bg-success-500'
												: 'bg-surface-400'}"
										></div>
										<span class="text-surface-600-300-token">
											{participant.isOnline ? 'Online' : 'Offline'}
										</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Group Management Modal -->
{#if chat.type === 'group'}
	<GroupManagementModal
		bind:show={showGroupManagement}
		groupChat={chat}
		on:save={handleGroupManagementSave}
		on:close={() => (showGroupManagement = false)}
	/>
{/if}
