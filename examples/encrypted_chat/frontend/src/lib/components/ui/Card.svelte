<script lang="ts">
	export let variant: 'filled' | 'glass' | 'outlined' = 'filled';
	export let padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
	let className: string = '';
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

	$: classes = [
		variantClasses[variant],
		paddingClasses[padding],
		className
	].filter(Boolean).join(' ');
</script>

<div class={classes} {...$$restProps}>
	<slot />
</div>