<script lang="ts">
	/** @type {{ variant: 'filled' | 'glass' | 'outlined' }}
	 *  @type {{ padding: 'none' | 'sm' | 'md' | 'lg' }}
	 */
	let { variant = 'filled', padding = 'md', children, className = '', ...rest } = $props();
	export { className as class };

	const variantClasses = {
		filled: 'card',
		glass: 'card variant-glass',
		outlined: 'card variant-outline'
	};

	const paddingClasses = {
		none: '',
		sm: 'p-4',
		md: 'p-6',
		lg: 'p-8'
	};

	let classes = $derived(
		[variantClasses[variant], paddingClasses[padding], className].filter(Boolean).join(' ')
	);
</script>

<div class={classes} {...rest}>
	{@render children?.()}
</div>
