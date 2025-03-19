import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import tailwindcss from 'tailwindcss'
import autoprefixer from "autoprefixer";
import css from 'rollup-plugin-css-only';
import typescript from '@rollup/plugin-typescript';

const production = false;// !process.env.VITE_WATCH_MODE;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    wasm(),
    topLevelAwait(),
    css({ output: "bundle.css" }),
    typescript({
      sourceMap: true,
      inlineSources: true,
    }),
  ],
  esbuild: {
    supported: {
      'top-level-await': true //browsers can handle top-level-await features
    },
  },
  define: {
    'process.env.DFX_NETWORK': JSON.stringify(process.env.DFX_NETWORK),
    'process.env.CANISTER_ID_INTERNET_IDENTITY': JSON.stringify(process.env.CANISTER_ID_INTERNET_IDENTITY),
    'process.env.CANISTER_ID_ENCRYPTED_MAPS_EXAMPLE': JSON.stringify(process.env.CANISTER_ID_ENCRYPTED_MAPS_EXAMPLE)
  },
  css: {
    postcss: {
      plugins: [autoprefixer(), tailwindcss()],
    }
  },
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
      sourcemap: true,
    },
  },
  root: "./",
  server: {
    hmr: false
  }
})