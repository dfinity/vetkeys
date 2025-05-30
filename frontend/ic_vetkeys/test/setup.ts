import { beforeAll } from "vitest";
import indexeddb from "fake-indexeddb";
import crypto from "node:crypto";

beforeAll(() => {
    Object.defineProperty(globalThis, "crypto", {
        value: crypto.webcrypto,
        writable: true,
    });

    globalThis.indexedDB = indexeddb;
});
