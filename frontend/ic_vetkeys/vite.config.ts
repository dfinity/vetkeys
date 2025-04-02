import { defineConfig } from 'vite';
import path from 'path';
import dts from 'vite-plugin-dts'

export default defineConfig({
    plugins: [dts({ outDir: 'dist/types' })],
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'index',
            formats: ['es'],
            fileName: (format) => `lib/index.${format}.js`
        },
        rollupOptions: {
            external: [],
            output: {
                globals: {}
            }
        },
        emptyOutDir: true
    },
    test: {
        environment: "happy-dom",
        setupFiles: ['test/setup.ts'],
        testTimeout: 120000
    }
});
