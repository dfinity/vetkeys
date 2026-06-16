/**
 * @module @icp-sdk/vetkeys/encrypted_maps
 *
 * @description Caching strategies for derived key material. See
 * {@link DerivedKeyMaterialCache}.
 */

import {
    clear as idbClear,
    createStore,
    get as idbGet,
    set as idbSet,
    type UseStore,
} from "idb-keyval";

/**
 * Strategy for caching the per-map derived key material handles used by
 * {@link EncryptedMaps}.
 *
 * Deriving key material requires a canister round-trip and threshold
 * cryptography, so it is cached and reused. The cached value is a
 * non-extractable {@link CryptoKey} handle: its raw bytes can never be read
 * back (`crypto.subtle.exportKey` throws), but the handle can still be *used*
 * to decrypt. Where that handle lives therefore matters for security — see the
 * provided implementations.
 *
 * Cache entries are keyed by an opaque string that {@link EncryptedMaps} scopes
 * to the authenticated caller, the map owner, and the map name, so a key cached
 * by one identity is never served to another.
 */
export interface DerivedKeyMaterialCache {
    /**
     * Returns the cached key handle for the given key, or `undefined` on a miss.
     */
    get(key: string): Promise<CryptoKey | undefined>;

    /**
     * Stores a key handle under the given key.
     */
    set(key: string, value: CryptoKey): Promise<void>;

    /**
     * Removes every cached key handle.
     *
     * Call this on logout or whenever the authenticated identity changes to
     * avoid leaving usable decryption capability behind.
     */
    clear(): Promise<void>;
}

/**
 * Default {@link DerivedKeyMaterialCache} that keeps key handles in memory only.
 *
 * Nothing is written to disk, so the cache is discarded when the page is
 * reloaded or the tab is closed and there is no at-rest exposure. The trade-off
 * is one extra key derivation per map per page load.
 */
export class InMemoryDerivedKeyMaterialCache implements DerivedKeyMaterialCache {
    readonly #entries = new Map<string, CryptoKey>();

    get(key: string): Promise<CryptoKey | undefined> {
        return Promise.resolve(this.#entries.get(key));
    }

    set(key: string, value: CryptoKey): Promise<void> {
        this.#entries.set(key, value);
        return Promise.resolve();
    }

    clear(): Promise<void> {
        this.#entries.clear();
        return Promise.resolve();
    }
}

/**
 * Opt-in {@link DerivedKeyMaterialCache} that persists key handles in IndexedDB.
 *
 * Key handles survive page reloads, avoiding repeated key derivation, but this
 * is a deliberate security trade-off: the persisted handle is non-extractable
 * (its raw bytes cannot be stolen), yet any same-origin code — e.g. via XSS, a
 * malicious extension, or a shared browser profile — can read the handle and
 * use it to decrypt the user's data without an authenticated session, for as
 * long as it remains stored.
 *
 * Prefer {@link InMemoryDerivedKeyMaterialCache} (the default) unless you need
 * cross-reload persistence and accept this exposure. When using this cache, be
 * sure to call {@link EncryptedMaps.clearCache} on logout or identity change.
 *
 * Note that an unauthenticated agent resolves to the anonymous principal, so
 * key material derived while anonymous is cached under a shared key and reused
 * across anonymous sessions on the same origin — consistent with the canister's
 * anonymous-access model.
 *
 * A dedicated IndexedDB store is used, so {@link clear} only removes entries
 * written by this cache and never touches other application data.
 */
export class IndexedDbDerivedKeyMaterialCache implements DerivedKeyMaterialCache {
    readonly #store: UseStore;

    /**
     * @param dbName - IndexedDB database name. Defaults to `"ic-vetkeys"`.
     * @param storeName - Object store name. Defaults to `"derived-key-material"`.
     */
    constructor(dbName = "ic-vetkeys", storeName = "derived-key-material") {
        this.#store = createStore(dbName, storeName);
    }

    async get(key: string): Promise<CryptoKey | undefined> {
        return idbGet<CryptoKey>(key, this.#store);
    }

    async set(key: string, value: CryptoKey): Promise<void> {
        await idbSet(key, value, this.#store);
    }

    async clear(): Promise<void> {
        await idbClear(this.#store);
    }
}
