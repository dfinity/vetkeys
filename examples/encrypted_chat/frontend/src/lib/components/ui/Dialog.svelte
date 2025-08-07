<script lang="ts">
	import { createDialog, melt } from '@melt-ui/svelte';
	import { fade, fly } from 'svelte/transition';
	import { X } from 'lucide-svelte';

	export let open: boolean = false;
	export let title: string = '';
	let className: string = '';
	export { className as class };

	const {
		elements: { trigger, overlay, content, title: titleEl, description, close },
		states: { open: openState }
	} = createDialog({
		defaultOpen: open
	});

	// Sync the open state bidirectionally
	$: openState.set(open);
	$: open = $openState;
</script>

<!-- Trigger slot (optional) -->
{#if $$slots.trigger}
	<slot name="trigger" {trigger} />
{/if}

{#if $openState}
	<!-- Overlay -->
	<div
		use:melt={$overlay}
		class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
	></div>

	<!-- Dialog Content -->
	<div
		use:melt={$content}
		class="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 card p-6 shadow-lg {className}"
		transition:fly={{ y: -50, duration: 200 }}
	>
		<!-- Close Button -->
		<button
			use:melt={$close}
			class="absolute right-4 top-4 btn-icon btn-icon-sm variant-ghost-surface hover:variant-filled-surface"
			aria-label="Close dialog"
		>
			<X size={16} />
		</button>

		<!-- Header -->
		{#if title || $$slots.header}
			<div class="mb-4">
				{#if title}
					<h2 use:melt={$titleEl} class="text-lg font-semibold text-on-surface-token">
						{title}
					</h2>
				{/if}
				<slot name="header" />
			</div>
		{/if}

		<!-- Description (for accessibility) -->
		<div use:melt={$description} class="sr-only">
			<slot name="description" />
		</div>

		<!-- Content -->
		<div class="dialog-content">
			<slot />
		</div>

		<!-- Footer -->
		{#if $$slots.footer}
			<div class="mt-6 flex justify-end gap-2">
				<slot name="footer" {close} />
			</div>
		{/if}
	</div>
{/if}