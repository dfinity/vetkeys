import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'ic_vetkd_sdk_encrypted_maps',
            formats: ['es', 'umd'],
            fileName: (format) => `ic_vetkd_sdk_encrypted_maps.${format}.js`
        },
        rollupOptions: {
            external: [],
            output: {
                globals: {}
            }
        }
    },
    test: {
        environment: "happy-dom",
        setupFiles: ['test/setup.ts'],
        testTimeout: 60000
    }
});