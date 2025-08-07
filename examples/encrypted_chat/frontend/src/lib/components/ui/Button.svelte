<script lang="ts">
	export let variant: 'filled' | 'outline' | 'ghost' | 'gradient' = 'filled';
	export let size: 'sm' | 'md' | 'lg' = 'md';
	export let disabled: boolean = false;
	export let type: 'button' | 'submit' | 'reset' = 'button';
	let className: string = '';
	export { className as class };

	// Define variant classes using Skeleton v3's design tokens
	const variantClasses = {
		filled: 'variant-filled-primary',
		outline: 'variant-outline-primary',
		ghost: 'variant-ghost-primary',
		gradient: 'bg-gradient-to-r from-primary-500 to-secondary-500 text-on-primary-token hover:from-primary-600 hover:to-secondary-600'
	};

	const sizeClasses = {
		sm: 'btn-sm',
		md: 'btn-md',
		lg: 'btn-lg'
	};

	$: classes = [
		'btn',
		variantClasses[variant],
		sizeClasses[size],
		'transition-all duration-200',
		className
	].filter(Boolean).join(' ');
</script>

<button class={classes} {disabled} {type} {...$$restProps} on:click>
	<slot />
</button>