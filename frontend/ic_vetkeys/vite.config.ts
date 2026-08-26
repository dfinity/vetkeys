import { defineConfig } from "vite";
import path from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
    plugins: [dts({ outDir: "dist/types" })],
    build: {
        lib: {
            entry: {
                index: path.resolve(__dirname, "src/index.ts"),
                key_manager: path.resolve(
                    __dirname,
                    "src/key_manager/index.ts",
                ),
                encrypted_maps: path.resolve(
                    __dirname,
                    "src/encrypted_maps/index.ts",
                ),
            },
            name: "ic_vetkeys",
            formats: ["es"],
            fileName: (format, entryName) => `${entryName}.${format}.js`,
        },
        outDir: "dist/lib",
        emptyOutDir: true,
        rollupOptions: {
            // Every runtime dependency stays external. `@icp-sdk/core` in
            // particular is a shared singleton whose classes cross this
            // package's public API (callers construct the `HttpAgent` they
            // pass in), so bundling a private copy would put two `HttpAgent`
            // / `Principal` identities in one application. It is declared as
            // a peerDependency for the same reason. Externalising the rest
            // keeps declared dependencies from being vendored twice, and lets
            // consumers patch the crypto libraries themselves.
            external: [
                /^@icp-sdk\/core(\/|$)/,
                /^@noble\/(curves|hashes)(\/|$)/,
                /^idb-keyval(\/|$)/,
            ],
        },
    },
    test: {
        environment: "node",
        setupFiles: ["test/setup.ts"],
        testTimeout: 120000,
    },
});
