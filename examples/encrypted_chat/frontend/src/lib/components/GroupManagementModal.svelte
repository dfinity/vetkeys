<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { UserPlus, UserMinus, X, Save, Users } from 'lucide-svelte';
	import type { GroupChat, User } from '../types';
	import { getMyPrincipal } from '$lib/stores/auth.svelte';
	import { Principal } from '@dfinity/principal';
	import type { Principal as PrincipalType } from '@dfinity/principal';

	export let show = false;
	export let groupChat: GroupChat;

	const dispatch = createEventDispatcher<{
		close: void;
		save: { addUsers: string[]; removeUsers: string[]; allowHistoryForNew: boolean };
	}>();

	let selectedToAdd: string[] = [];
	let selectedToRemove: string[] = [];
	let allowHistoryForNew = true;
	let usersToShow: User[] = [];

	// Text input for adding multiple principals
	let principalsInput = '';
	let validPrincipalStrings: string[] = [];
	let invalidPrincipalTokens: string[] = [];

	// Reactively parse and validate principals from text input
	$: {
		const rawTokens = principalsInput
			.split(/[\s,;\n\r]+/)
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
		const uniqueTokens = Array.from(new Set(rawTokens));
		const nextValid: string[] = [];
		const nextInvalid: string[] = [];
		for (const token of uniqueTokens) {
			try {
				// Validate deserialization. Keep original string for dispatching.
				Principal.fromText(token);
				nextValid.push(token);
			} catch (_) {
				nextInvalid.push(token);
			}
		}
		validPrincipalStrings = nextValid;
		invalidPrincipalTokens = nextInvalid;
	}

	// Total adds including typed principals
	$: totalAddCount = selectedToAdd.length + validPrincipalStrings.length;
	$: canSave =
		(totalAddCount > 0 || selectedToRemove.length > 0) && invalidPrincipalTokens.length === 0;

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
		// Block saving if any invalid principals are present
		if (invalidPrincipalTokens.length > 0) {
			return;
		}
		const combinedAddUsers = Array.from(new Set([...selectedToAdd, ...validPrincipalStrings]));
		dispatch('save', {
			addUsers: combinedAddUsers,
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
		principalsInput = '';
		validPrincipalStrings = [];
		invalidPrincipalTokens = [];
		dispatch('close');
	}

	function canRemoveUser(userId: PrincipalType): boolean {
		// Can't remove current user or admin
		return (
			userId.toString() !== getMyPrincipal().toString() && userId.toString() !== groupChat.adminId
		);
	}
</script>

{#if show}
	<!-- Backdrop -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<!-- Modal -->
		<div
			class="card max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl shadow-2xl backdrop-blur-xl"
		>
			<!-- Header -->
			<div class="border-surface-300-600-token flex items-center justify-between border-b p-6">
				<div class="flex items-center gap-3">
					<Users class="h-6 w-6" />
					<h2 class="text-lg font-bold">Manage Group: {groupChat.name}</h2>
				</div>
				<button class="variant-ghost-surface btn-icon" onclick={handleClose} aria-label="Close">
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
										class="avatar bg-primary-500 flex h-8 w-8 items-center justify-center rounded-full text-sm"
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
											{#if member.id.toString() === groupChat.adminId}
												<span class="bg-primary-500 rounded px-2 py-0.5 text-xs text-white"
													>Admin</span
												>
											{/if}
											{#if member.id.toString() === getMyPrincipal().toString()}
												<span class="bg-surface-400 rounded px-2 py-0.5 text-xs text-white"
													>You</span
												>
											{/if}
										</div>
									</div>
								</div>

								{#if canRemoveUser(member.id)}
									<button
										class="variant-ghost-error btn-icon"
										onclick={() => toggleRemoveUser(member.id.toString())}
										class:variant-filled-error={selectedToRemove.includes(member.id.toString())}
										title="Remove from group"
									>
										<UserMinus class="h-4 w-4" />
									</button>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- Add by Principal Text Input -->
				<div>
					<h3 class="mb-3 font-semibold">Add by Principal</h3>
					<div class="space-y-2">
						<textarea
							class="border-surface-300-600-token w-full rounded-lg border p-3 text-sm focus:outline-none"
							class:border-error-500={invalidPrincipalTokens.length > 0}
							rows="3"
							bind:value={principalsInput}
							placeholder="Enter one or more principals separated by commas or whitespace"
						></textarea>

						{#if invalidPrincipalTokens.length > 0}
							<div class="text-error-500 text-xs">
								Invalid principals:
								<div class="mt-1 flex flex-wrap gap-1">
									{#each invalidPrincipalTokens as t}
										<span class="bg-error-500/10 text-error-600 rounded px-2 py-0.5">{t}</span>
									{/each}
								</div>
							</div>
						{:else if validPrincipalStrings.length > 0}
							<div class="text-surface-600-300-token text-xs">
								Will add {validPrincipalStrings.length} principal{validPrincipalStrings.length !== 1 ? 's' : ''}
							</div>
						{/if}
					</div>
				</div>

			<!-- Options -->
			{#if totalAddCount > 0}
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
			{#if totalAddCount > 0 || selectedToRemove.length > 0}
					<div class="border-primary-500/20 bg-primary-500/10 rounded-lg border p-4">
						<h4 class="mb-2 text-sm font-semibold">Changes Summary</h4>
						<div class="space-y-1 text-sm">
						{#if totalAddCount > 0}
								<p class="text-success-500">
								+ {totalAddCount} member{totalAddCount !== 1 ? 's' : ''} to add
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
				<button
					class="variant-ghost-surface btn"
					onclick={handleClose}
					title="Cancel"
					aria-label="Cancel"
				>
					<X class="h-4 w-4" />
				</button>
				<button
					class="variant-filled-primary btn"
					onclick={handleSave}
					disabled={!canSave}
					title="Save Changes"
					aria-label="Save Changes"
				>
					<Save class="h-4 w-4" />
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
