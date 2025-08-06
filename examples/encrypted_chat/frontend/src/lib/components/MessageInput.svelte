<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Send, Paperclip, Smile, X } from 'lucide-svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import type { FileUpload } from '../types';

	export let disabled = false;
	export let placeholder = 'Type a message...';

	const dispatch = createEventDispatcher<{
		send: { content: string; file?: FileUpload };
	}>();

	let messageText = '';
	let showEmojiPicker = false;
	let fileInput: HTMLInputElement;
	let selectedFile: FileUpload | null = null;

	const MAX_FILE_SIZE = 100 * 1024; // 100KB

	function handleSend() {
		const content = messageText.trim();
		if (!content && !selectedFile) return;

		dispatch('send', {
			content: content || (selectedFile ? `📎 ${selectedFile.file.name}` : ''),
			file: selectedFile || undefined
		});

		messageText = '';
		selectedFile = null;
		showEmojiPicker = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	}

	function handleFileSelect() {
		fileInput.click();
	}

	function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;

		if (file.size > MAX_FILE_SIZE) {
			selectedFile = {
				file,
				isValid: false,
				error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024}KB.`
			};
			return;
		}

		selectedFile = {
			file,
			isValid: true
		};

		// Generate preview for images
		if (file.type.startsWith('image/')) {
			const reader = new FileReader();
			reader.onload = (e) => {
				if (selectedFile) {
					selectedFile.preview = e.target?.result as string;
				}
			};
			reader.readAsDataURL(file);
		}
	}

	function removeFile() {
		selectedFile = null;
		if (fileInput) {
			fileInput.value = '';
		}
	}

	function handleEmojiSelect(event: CustomEvent<string>) {
		const emoji = event.detail;
		messageText = messageText + emoji;
		showEmojiPicker = false;

		// Focus back on input
		const textarea = document.querySelector('.message-input') as HTMLTextAreaElement;
		if (textarea) {
			textarea.focus();
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}
</script>

<div
	class="message-input-container bg-surface-100-800-token border-surface-300-600-token border-t p-4"
>
	<!-- File preview -->
	{#if selectedFile}
		<div class="file-preview bg-surface-200-700-token mb-3 rounded-lg p-3">
			<div class="flex items-start gap-3">
				{#if selectedFile.preview}
					<img src={selectedFile.preview} alt="Preview" class="h-16 w-16 rounded object-cover" />
				{:else}
					<div class="bg-surface-300-600-token flex h-16 w-16 items-center justify-center rounded">
						<Paperclip class="h-6 w-6" />
					</div>
				{/if}

				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{selectedFile.file.name}</p>
					<p class="text-surface-600-300-token text-xs">{formatFileSize(selectedFile.file.size)}</p>
					{#if !selectedFile.isValid && selectedFile.error}
						<p class="mt-1 text-xs text-error-500">{selectedFile.error}</p>
					{/if}
				</div>

				<button
					class="variant-ghost-surface btn-icon"
					on:click={removeFile}
					aria-label="Remove file"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/if}

	<!-- Input area -->
	<div class="flex items-end gap-2">
		<!-- File input -->
		<input
			type="file"
			bind:this={fileInput}
			on:change={handleFileChange}
			accept="image/*,.pdf,.doc,.docx,.txt,.zip"
			style="display: none;"
		/>

		<!-- File button -->
		<button
			class="variant-ghost-surface btn-icon"
			on:click={handleFileSelect}
			{disabled}
			aria-label="Attach file"
		>
			<Paperclip class="h-5 w-5" />
		</button>

		<!-- Message input -->
		<div class="relative flex-1">
			<textarea
				bind:value={messageText}
				on:keydown={handleKeydown}
				{placeholder}
				{disabled}
				rows="1"
				class="message-input bg-surface-200-700-token border-surface-300-600-token w-full resize-none rounded-lg border px-3 py-2 pr-10 text-sm focus:border-transparent focus:ring-2 focus:ring-primary-500 focus:outline-none"
				style="min-height: 40px; max-height: 120px;"
			></textarea>

			<!-- Emoji button -->
			<button
				class="variant-ghost-surface absolute top-1/2 right-2 btn-icon -translate-y-1/2"
				on:click={() => (showEmojiPicker = !showEmojiPicker)}
				{disabled}
				aria-label="Add emoji"
			>
				<Smile class="h-4 w-4" />
			</button>
		</div>

		<!-- Send button -->
		<button
			class="variant-filled-primary btn"
			on:click={handleSend}
			disabled={disabled ||
				(!messageText.trim() && !selectedFile) ||
				(selectedFile && !selectedFile.isValid)}
			aria-label="Send message"
		>
			<Send class="h-5 w-5" />
		</button>
	</div>

	<!-- File size info -->
	<div class="text-surface-600-300-token mt-2 text-xs">
		Maximum file size: {MAX_FILE_SIZE / 1024}KB
	</div>
</div>

<!-- Emoji Picker -->
<EmojiPicker
	bind:show={showEmojiPicker}
	on:select={handleEmojiSelect}
	on:close={() => (showEmojiPicker = false)}
/>

<style>
	.message-input {
		scrollbar-width: thin;
	}

	.message-input::-webkit-scrollbar {
		width: 4px;
	}

	.message-input::-webkit-scrollbar-thumb {
		background-color: var(--color-surface-400);
		border-radius: 2px;
	}
</style>
