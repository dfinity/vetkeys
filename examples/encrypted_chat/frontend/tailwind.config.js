import { skeleton } from '@skeletonlabs/tw-plugin';

/** @type {import('tailwindcss').Config} */
export default {
	darkMode: 'selector',
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		'./node_modules/@skeletonlabs/skeleton/**/*.{html,js,svelte,ts}'
	],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Inter', 'system-ui', 'sans-serif']
			}
		}
	},
	plugins: [
		skeleton({
			themes: {
				preset: ['modern']
			}
		})
	]
};
