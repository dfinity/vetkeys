import { beforeAll } from 'vitest';
import crypto from 'node:crypto';

beforeAll(() => {
    Object.defineProperty(window, 'crypto', {
        value: crypto.webcrypto,
        writable: true,
    });
});
