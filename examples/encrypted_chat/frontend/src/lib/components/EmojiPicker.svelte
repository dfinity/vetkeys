<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let show = false;

	const dispatch = createEventDispatcher<{
		select: string;
		close: void;
	}>();

	const emojiCategories = {
		Faces: [
			'😀',
			'😃',
			'😄',
			'😁',
			'😆',
			'😅',
			'😂',
			'🤣',
			'😊',
			'😇',
			'🙂',
			'🙃',
			'😉',
			'😌',
			'😍',
			'🥰',
			'😘',
			'😗',
			'😙',
			'😚',
			'😋',
			'😛',
			'😝',
			'😜',
			'🤪',
			'🤨',
			'🧐',
			'🤓',
			'😎',
			'🤩'
		],
		Hands: [
			'👍',
			'👎',
			'👌',
			'🤌',
			'🤏',
			'✌️',
			'🤞',
			'🤟',
			'🤘',
			'🤙',
			'👈',
			'👉',
			'👆',
			'🖕',
			'👇',
			'☝️',
			'👋',
			'🤚',
			'🖐️',
			'✋',
			'🖖',
			'👏',
			'🙌',
			'🤲',
			'🤝',
			'🙏'
		],
		Objects: [
			'❤️',
			'🧡',
			'💛',
			'💚',
			'💙',
			'💜',
			'🖤',
			'🤍',
			'🤎',
			'💔',
			'❣️',
			'💕',
			'💞',
			'💓',
			'💗',
			'💖',
			'💘',
			'💝',
			'💟',
			'⚡',
			'💥',
			'💫',
			'⭐',
			'🌟',
			'✨',
			'💎',
			'🔥',
			'💯'
		],
		Symbols: [
			'✅',
			'❌',
			'⚠️',
			'🚀',
			'🔒',
			'🔓',
			'🔑',
			'🛡️',
			'⭐',
			'💫',
			'✨',
			'🎯',
			'🏆',
			'🎉',
			'🎊',
			'💡',
			'📢',
			'📣',
			'📯',
			'🔔',
			'🔕',
			'🆕',
			'🆓',
			'🆒',
			'🔥',
			'💯',
			'✔️',
			'❗',
			'❓',
			'ℹ️'
		]
	};

	function selectEmoji(emoji: string) {
		dispatch('select', emoji);
		show = false;
	}

	function closeModal() {
		dispatch('close');
		show = false;
	}

	// Close on outside click
	function handleOutsideClick(event: MouseEvent) {
		const target = event.target as Element;
		if (target && !target.closest('.emoji-picker')) {
			closeModal();
		}
	}
</script>

{#if show}
	<!-- Backdrop -->
	<div
		class="bg-opacity-25 fixed inset-0 z-40 bg-black"
		on:click={handleOutsideClick}
		role="button"
		tabindex="-1"
		on:keydown={() => {}}
	></div>

	<!-- Emoji Picker -->
	<div
		class="emoji-picker bg-surface-100-800-token border-surface-300-600-token fixed right-4 bottom-20 z-50 max-w-sm rounded-lg border p-4 shadow-xl"
	>
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-sm font-semibold">Add Emoji</h3>
			<button
				class="variant-ghost-surface btn-icon"
				on:click={closeModal}
				aria-label="Close emoji picker"
			>
				×
			</button>
		</div>

		<div class="emoji-grid scrollbar-thin max-h-64 overflow-y-auto">
			{#each Object.entries(emojiCategories) as [category, emojis] (category)}
				<div class="emoji-category mb-4">
					<h4 class="text-surface-600-300-token mb-2 text-xs font-medium">{category}</h4>
					<div class="grid grid-cols-8 gap-1">
						{#each emojis as emoji (emoji)}
							<button
								class="emoji-button hover:bg-surface-200-700-token flex h-8 w-8 items-center justify-center rounded text-lg transition-colors"
								on:click={() => selectEmoji(emoji)}
								title={emoji}
							>
								{emoji}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<div class="border-surface-300-600-token mt-4 border-t pt-3">
			<p class="text-surface-600-300-token text-xs">
				You can also type emoji shortcodes like <code>:smile:</code>, <code>:heart:</code>,
				<code>:rocket:</code>
			</p>
		</div>
	</div>
{/if}

<style>
	.emoji-picker {
		width: 320px;
		max-height: 400px;
	}

	.emoji-button:hover {
		transform: scale(1.1);
	}

	code {
		background: var(--color-surface-200);
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 10px;
	}

	:global(.dark) code {
		background: var(--color-surface-700);
	}
</style>
