<script lang="ts">
	export let variant: 'filled' | 'outline' | 'soft' = 'filled';
	export let color: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' = 'primary';
	let className: string = '';
	export { className as class };

	$: classes = [
		'badge',
		`variant-${variant}-${color}`,
		'transition-all duration-200',
		className
	].filter(Boolean).join(' ');
</script>

<span class={classes} {...$$restProps}>
	<slot />
</span>