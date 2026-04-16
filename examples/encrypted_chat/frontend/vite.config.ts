import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';

const environment = process.env.ICP_ENVIRONMENT || 'local';
const CANISTER_NAMES = ['encrypted_chat'];

function buildDevConfig() {
	const networkStatus = JSON.parse(
		execSync(`icp network status -e ${environment} --json --project-root-override ../rust`, {
			encoding: 'utf-8'
		})
	);
	const canisterParams = CANISTER_NAMES.map((name) => {
		const id = execSync(
			`icp canister status ${name} -e ${environment} --id-only --project-root-override ../rust`,
			{ encoding: 'utf-8', stdio: 'pipe' }
		).trim();
		return `PUBLIC_CANISTER_ID:${name}=${id}`;
	}).join('&');

	return {
		cookie: `ic_env=${encodeURIComponent(
			`${canisterParams}&ic_root_key=${networkStatus.root_key}`
		)}; SameSite=Lax`,
		apiUrl: networkStatus.api_url as string
	};
}

// SvelteKit's SSR handler intercepts requests before Vite's built-in header
// middleware can set response headers, so `server.headers` is not reliable for
// delivering the ic_env cookie on page responses.  This plugin sets it two ways:
//   1. HTTP middleware  – covers static-asset responses served directly by Vite.
//   2. Injected <script> – sets document.cookie client-side, which is the reliable
//      path for SSR-rendered pages where the HTTP header may not arrive.
function icEnvPlugin(cookie: string): Plugin {
	return {
		name: 'ic-env-cookie',
		configureServer(server) {
			server.middlewares.use((_req, res, next) => {
				res.setHeader('Set-Cookie', cookie);
				next();
			});
		},
		transformIndexHtml() {
			return [
				{
					tag: 'script',
					injectTo: 'head-prepend' as const,
					children: `document.cookie = ${JSON.stringify(cookie)};`
				}
			];
		}
	};
}

export default defineConfig(({ command }) => {
	if (command !== 'serve') {
		return {
			plugins: [tailwindcss(), sveltekit()],
			define: { 'process.env': {} },
			build: { sourcemap: true }
		};
	}

	const { cookie, apiUrl } = buildDevConfig();
	return {
		plugins: [tailwindcss(), sveltekit(), icEnvPlugin(cookie)],
		define: { 'process.env': {} },
		build: { sourcemap: true },
		server: {
			proxy: { '/api': { target: apiUrl, changeOrigin: true } },
			hmr: false
		}
	};
});
