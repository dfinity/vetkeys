// Polyfill for process.env in Vite preview

if (typeof process === "undefined") {
    (globalThis as any).process = {
        env: {}
    };
}


import "./app.css";
import App from "./App.svelte";

const app = new App({
    target: document.body,
});

export default app;
