<script lang="ts">
	import { Settings, RotateCcw, Info, ArrowLeft } from 'lucide-svelte';
	import Button from './ui/Button.svelte';
	import Card from './ui/Card.svelte';
	import type { Chat, SymmetricRatchetStats, GroupChat } from '../types';
	import { chatAPI } from '../services/api';
	import { chatActions } from '../stores/chat.svelte';
	import GroupManagementModal from './GroupManagementModal.svelte';
	import { Principal } from '@dfinity/principal';

	export let chat: Chat;
	export let showMobileBackButton = false;
	export let onMobileBack: (() => void) | undefined = undefined;

	let showChatInfo = false;
	let ratchetStats: SymmetricRatchetStats | null = null;
	let loadingRatchetStats = false;
	let showGroupManagement = false;

	// Reset state when chat changes
	$: if (chat) {
		showChatInfo = false;
		ratchetStats = null;
		loadingRatchetStats = false;
		showGroupManagement = false;
	}

	function handleChatInfoToggle() {
		showChatInfo = !showChatInfo;
		if (showChatInfo && !ratchetStats && !loadingRatchetStats) {
			loadRatchetStats();
		}
	}

	function loadRatchetStats() {
		if (!chat) return;

		loadingRatchetStats = true;
		try {
			ratchetStats = chatAPI.getRatchetStats();
		} catch (error) {
			console.error('Failed to load ratchet stats:', error);
		} finally {
			loadingRatchetStats = false;
		}
	}

	function getDisplayName(): string {
		return chat.name;
	}

	function getDisplayAvatar(): string {
		if (chat.type === 'direct') {
			return '👤';
		}
		return chat.avatar || '👥';
	}

	function formatDate(date: Date): string {
		return date.toLocaleString();
	}

	async function handleGroupManagementSave(
		event: CustomEvent<{
			addUsers: string[];
			removeUsers: string[];
			allowHistoryForNew: boolean;
		}>
	) {
		const { addUsers, removeUsers, allowHistoryForNew } = event.detail;

		const addUsersPrincipal = addUsers.map((id) => Principal.fromText(id));
		const removeUsersPrincipal = removeUsers.map((id) => Principal.fromText(id));

		try {
			await chatActions.updateGroupMembers(
				chat.id,
				addUsersPrincipal,
				removeUsersPrincipal,
				allowHistoryForNew
			);

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

<div class="chat-header glass-effect border-b border-white/10 p-6 backdrop-blur-xl">
	<div class="flex items-center justify-between">
		<!-- Chat info -->
		<div class="flex items-center gap-3">
			<!-- Mobile back button -->
			{#if showMobileBackButton}
				<Button
					variant="ghost"
					size="sm"
					class="md:hidden"
					onclick={onMobileBack || (() => {})}
					aria-label="Back to chat list"
				>
					<ArrowLeft class="h-5 w-5" />
				</Button>
			{/if}
			<div
				class="avatar flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-lg font-bold text-white shadow-lg"
			>
				{getDisplayAvatar()}
			</div>
			<div>
				<h2
					class="bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-xl font-bold text-transparent dark:from-gray-100 dark:to-gray-300"
				>
					{getDisplayName()}
				</h2>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2">
			<Button variant="ghost" size="sm" onclick={handleChatInfoToggle} title="Chat information">
				<Info class="h-5 w-5" />
			</Button>

			{#if chat.type === 'group'}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => (showGroupManagement = true)}
					title="Manage group"
				>
					<Settings class="h-5 w-5" />
				</Button>
			{/if}
		</div>
	</div>

	<!-- Chat info panel -->
	{#if showChatInfo}
		<Card class="mt-4">
			<h3 class="mb-3 font-semibold">Chat Information</h3>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<!-- Basic info -->
				<div>
					<h4 class="mb-2 font-medium">Details</h4>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-surface-500-400">Type:</span>
							<span class="capitalize">{chat.type}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-500-400">Participants:</span>
							<span>{chat.participants.length}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-500-400">Disappearing messages:</span>
							<span
								>{chat.disappearingMessagesDuration === 0
									? 'Disabled'
									: `${chat.disappearingMessagesDuration} days`}</span
							>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-500-400">Status:</span>
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
							<span class="text-surface-500-400">Ratchet epoch:</span>
							<span>{chat.ratchetEpoch}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-500-400">Last key rotation:</span>
							<span>{formatDate(chat.keyRotationStatus.lastRotation)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-500-400">Next rotation:</span>
							<span>{formatDate(chat.keyRotationStatus.nextRotation)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-500-400">Rotation needed:</span>
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
								<span class="text-surface-500-400">Current epoch:</span>
								<span>{ratchetStats.currentEpoch}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-surface-500-400">Messages in epoch:</span>
								<span>{ratchetStats.messagesInCurrentEpoch}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-surface-500-400">Last rotation:</span>
								<span>{formatDate(ratchetStats.lastRotation)}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-surface-500-400">Next scheduled:</span>
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
										class="avatar bg-primary-500 flex h-6 w-6 items-center justify-center rounded-full text-xs"
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
										<span class="text-surface-500-400">
											{participant.isOnline ? 'Online' : 'Offline'}
										</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</Card>
	{/if}
</div>

<!-- Group Management Modal -->
{#if chat.type === 'group'}
	<GroupManagementModal
		bind:show={showGroupManagement}
		groupChat={chat as GroupChat}
		on:save={handleGroupManagementSave}
		on:close={() => (showGroupManagement = false)}
	/>
{/if}
