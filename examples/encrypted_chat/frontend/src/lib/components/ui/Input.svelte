<script lang="ts">
	export let value: string | number = '';
	export let type: string = 'text';
	export let placeholder: string = '';
	export let disabled: boolean = false;
	export let required: boolean = false;
	export let variant: 'default' | 'minimal' = 'default';
	let className: string = '';
	export { className as class };

	const variantClasses = {
		default: 'input',
		minimal: 'input variant-form-material'
	};

	$: classes = [
		variantClasses[variant],
		'transition-all duration-200',
		'focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
		className
	].filter(Boolean).join(' ');
</script>

<input
	class={classes}
	{type}
	{placeholder}
	{disabled}
	{required}
	bind:value
	{...$$restProps}
	on:input
	on:change
	on:blur
	on:focus
/>