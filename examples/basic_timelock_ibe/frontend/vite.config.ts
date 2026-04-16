import { defineConfig } from "vite";
import { execSync } from "child_process";

const environment = process.env.ICP_ENVIRONMENT || "local";
const CANISTER_NAMES = ["basic_timelock_ibe"];

function getCanisterId(name: string): string {
    return execSync(
        `icp canister status ${name} -e ${environment} --id-only`,
        { encoding: "utf-8", stdio: "pipe" },
    ).trim();
}

function getDevServerConfig() {
    const networkStatus = JSON.parse(
        execSync(`icp network status -e ${environment} --json`, {
            encoding: "utf-8",
        }),
    );
    const canisterParams = CANISTER_NAMES.map(
        (name) => `PUBLIC_CANISTER_ID:${name}=${getCanisterId(name)}`,
    ).join("&");
    return {
        headers: {
            "Set-Cookie": `ic_env=${encodeURIComponent(
                `${canisterParams}&ic_root_key=${networkStatus.root_key}`,
            )}; SameSite=Lax;`,
        },
        proxy: {
            "/api": { target: networkStatus.api_url, changeOrigin: true },
        },
        hmr: false,
    };
}

export default defineConfig(({ command }) => ({
    build: {
        sourcemap: true,
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    root: "./",
    ...(command === "serve" ? { server: getDevServerConfig() } : {}),
}));
