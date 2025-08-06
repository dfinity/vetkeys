<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { UserPlus, UserMinus, X, Save, Users } from 'lucide-svelte';
	import type { GroupChat, User } from '../types';

	export let show = false;
	export let groupChat: GroupChat;

	const dispatch = createEventDispatcher<{
		close: void;
		save: { addUsers: string[]; removeUsers: string[]; allowHistoryForNew: boolean };
	}>();

	// Dummy users that could be added to the group
	const availableUsers: User[] = [
		{ id: 'user-frank', name: 'Frank Miller', avatar: '👨‍🏫', isOnline: true },
		{ id: 'user-grace', name: 'Grace Lee', avatar: '👩‍⚕️', isOnline: false },
		{ id: 'user-henry', name: 'Henry Taylor', avatar: '👨‍🎤', isOnline: true },
		{ id: 'user-ivy', name: 'Ivy Chen', avatar: '👩‍🎨', isOnline: false }
	];

	let selectedToAdd: string[] = [];
	let selectedToRemove: string[] = [];
	let allowHistoryForNew = false;

	function toggleAddUser(userId: string) {
		if (selectedToAdd.includes(userId)) {
			selectedToAdd = selectedToAdd.filter((id) => id !== userId);
		} else {
			selectedToAdd = [...selectedToAdd, userId];
		}
	}

	function toggleRemoveUser(userId: string) {
		if (selectedToRemove.includes(userId)) {
			selectedToRemove = selectedToRemove.filter((id) => id !== userId);
		} else {
			selectedToRemove = [...selectedToRemove, userId];
		}
	}

	function handleSave() {
		dispatch('save', {
			addUsers: selectedToAdd,
			removeUsers: selectedToRemove,
			allowHistoryForNew
		});
		handleClose();
	}

	function handleClose() {
		show = false;
		selectedToAdd = [];
		selectedToRemove = [];
		allowHistoryForNew = false;
		dispatch('close');
	}

	function canRemoveUser(userId: string): boolean {
		// Can't remove current user or admin
		return userId !== 'current-user' && userId !== groupChat.adminId;
	}

	// Filter available users to only show those not in the group
	let usersToShow: User[] = [];
	$: usersToShow = availableUsers.filter(
		(user) => !groupChat.participants.some((p) => p.id === user.id)
	);
</script>

{#if show}
	<!-- Backdrop -->
	<div class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
		<!-- Modal -->
		<div
			class="bg-surface-100-800-token max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg shadow-xl"
		>
			<!-- Header -->
			<div class="border-surface-300-600-token flex items-center justify-between border-b p-6">
				<div class="flex items-center gap-3">
					<Users class="h-6 w-6" />
					<h2 class="text-lg font-bold">Manage Group: {groupChat.name}</h2>
				</div>
				<button class="variant-ghost-surface btn-icon" on:click={handleClose} aria-label="Close">
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="max-h-[60vh] space-y-6 overflow-y-auto p-6">
				<!-- Current Members -->
				<div>
					<h3 class="mb-3 font-semibold">Current Members ({groupChat.participants.length})</h3>
					<div class="space-y-2">
						{#each groupChat.participants as member (member.id)}
							<div
								class="bg-surface-200-700-token flex items-center justify-between rounded-lg p-3"
							>
								<div class="flex items-center gap-3">
									<div
										class="avatar flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm"
									>
										{member.avatar || '👤'}
									</div>
									<div>
										<p class="text-sm font-medium">{member.name}</p>
										<div class="text-surface-600-300-token flex items-center gap-2 text-xs">
											<div
												class="h-2 w-2 rounded-full {member.isOnline
													? 'bg-success-500'
													: 'bg-surface-400'}"
											></div>
											{member.isOnline ? 'Online' : 'Offline'}
											{#if member.id === groupChat.adminId}
												<span class="rounded bg-primary-500 px-2 py-0.5 text-xs text-white"
													>Admin</span
												>
											{/if}
											{#if member.id === 'current-user'}
												<span class="rounded bg-surface-400 px-2 py-0.5 text-xs text-white"
													>You</span
												>
											{/if}
										</div>
									</div>
								</div>

								{#if canRemoveUser(member.id)}
									<button
										class="variant-ghost-error btn-icon"
										on:click={() => toggleRemoveUser(member.id)}
										class:variant-filled-error={selectedToRemove.includes(member.id)}
										title="Remove from group"
									>
										<UserMinus class="h-4 w-4" />
									</button>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- Add New Members -->
				{#if usersToShow.length > 0}
					<div>
						<h3 class="mb-3 font-semibold">Add Members</h3>
						<div class="space-y-2">
							{#each usersToShow as user (user.id)}
								<div
									class="bg-surface-200-700-token flex items-center justify-between rounded-lg p-3"
								>
									<div class="flex items-center gap-3">
										<div
											class="avatar flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm"
										>
											{user.avatar || '👤'}
										</div>
										<div>
											<p class="text-sm font-medium">{user.name}</p>
											<div class="text-surface-600-300-token flex items-center gap-2 text-xs">
												<div
													class="h-2 w-2 rounded-full {user.isOnline
														? 'bg-success-500'
														: 'bg-surface-400'}"
												></div>
												{user.isOnline ? 'Online' : 'Offline'}
											</div>
										</div>
									</div>

									<button
										class="variant-ghost-success btn-icon"
										on:click={() => toggleAddUser(user.id)}
										class:variant-filled-success={selectedToAdd.includes(user.id)}
										title="Add to group"
									>
										<UserPlus class="h-4 w-4" />
									</button>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<div class="text-surface-600-300-token py-8 text-center">
						<Users class="mx-auto mb-2 h-12 w-12 opacity-50" />
						<p>No additional users available to add</p>
					</div>
				{/if}

				<!-- Options -->
				{#if selectedToAdd.length > 0}
					<div>
						<h3 class="mb-3 font-semibold">Options</h3>
						<label
							class="bg-surface-200-700-token flex cursor-pointer items-center gap-3 rounded-lg p-3"
						>
							<input type="checkbox" bind:checked={allowHistoryForNew} class="checkbox" />
							<div>
								<p class="text-sm font-medium">Allow new members to see chat history</p>
								<p class="text-surface-600-300-token text-xs">
									New members will be able to see messages sent before they joined
								</p>
							</div>
						</label>
					</div>
				{/if}

				<!-- Summary -->
				{#if selectedToAdd.length > 0 || selectedToRemove.length > 0}
					<div class="rounded-lg border border-primary-500/20 bg-primary-500/10 p-4">
						<h4 class="mb-2 text-sm font-semibold">Changes Summary</h4>
						<div class="space-y-1 text-sm">
							{#if selectedToAdd.length > 0}
								<p class="text-success-500">
									+ {selectedToAdd.length} member{selectedToAdd.length !== 1 ? 's' : ''} to add
								</p>
							{/if}
							{#if selectedToRemove.length > 0}
								<p class="text-error-500">
									- {selectedToRemove.length} member{selectedToRemove.length !== 1 ? 's' : ''} to remove
								</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="border-surface-300-600-token flex items-center justify-end gap-3 border-t p-6">
				<button class="variant-ghost-surface btn" on:click={handleClose}> Cancel </button>
				<button
					class="variant-filled-primary btn"
					on:click={handleSave}
					disabled={selectedToAdd.length === 0 && selectedToRemove.length === 0}
				>
					<Save class="mr-2 h-4 w-4" />
					Save Changes
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.checkbox {
		width: 1rem;
		height: 1rem;
		border: 2px solid var(--color-surface-400);
		border-radius: 0.25rem;
		background: transparent;
		cursor: pointer;
	}

	.checkbox:checked {
		background: var(--color-primary-500);
		border-color: var(--color-primary-500);
	}
</style>
