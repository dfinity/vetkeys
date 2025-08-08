<script lang="ts">
	/** @type {{ variant: 'filled' | 'outline' | 'ghost' | 'gradient' }}
	 *  @type {{ size: 'sm' | 'md' | 'lg' }}
	 *  @type {{ type: 'button' | 'submit' | 'reset' }}
	 */
	let {
		onclick,
		variant = 'filled',
		size = 'md',
		disabled = false,
		type = 'button',
		className = '',
		children,
		...rest
	} = $props();
	export { className as class };

	// Define variant classes using Skeleton v3's design tokens
	const variantClasses = {
		filled: 'variant-filled-primary',
		outline: 'variant-outline-primary',
		ghost: 'variant-ghost-primary',
		gradient:
			'bg-gradient-to-r from-primary-500 to-secondary-500 text-on-primary-token hover:from-primary-600 hover:to-secondary-600'
	};

	const sizeClasses = {
		sm: 'btn-sm',
		md: 'btn-md',
		lg: 'btn-lg'
	};

	let classes = $derived(
		['btn', variantClasses[variant], sizeClasses[size], 'transition-all duration-200', className]
			.filter(Boolean)
			.join(' ')
	);
</script>

<button class={classes} {disabled} {type} {...rest} {onclick}>
	{@render children?.()}
</button>
