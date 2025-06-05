import { defineConfig } from 'vite'
import typescript from '@rollup/plugin-typescript';
import environment from 'vite-plugin-environment';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    typescript({
      inlineSources: true,
    }),
    environment("all", { prefix: "CANISTER_" }),
    environment("all", { prefix: "DFX_" }),
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      'ic_vetkeys': path.resolve(__dirname, '../../../frontend/ic_vetkeys/src'),
      'ic_vetkeys/encrypted_maps': path.resolve(__dirname, '../../../frontend/ic_vetkeys/src/encrypted_maps'),
    }
  },
  root: "./",
  server: {
    hmr: false
  }
})