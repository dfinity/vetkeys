/**
 * @module @icp-sdk/vetkeys/encrypted_maps
 *
 * @description Caching strategies for derived key material. See
 * {@link DerivedKeyMaterialCache}.
 */

import {
    clear as idbClear,
    get as idbGet,
    promisifyRequest,
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
 * Cache entries are keyed by an opaque string derived from the map owner and
 * map name. Derived key material is per map, not per caller, so the key does
 * not encode the identity. Isolating one identity's cached keys from another's
 * on the same origin is therefore a property of the cache instance: use a fresh
 * cache per identity (the in-memory default is naturally per-instance), or give
 * a persistent cache a per-identity namespace (see
 * {@link IndexedDbDerivedKeyMaterialCache}).
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
 * An idb-keyval {@link UseStore} that opens a fresh connection for each
 * operation and closes it as soon as the operation settles.
 *
 * idb-keyval's own `createStore` keeps one connection open for the lifetime of
 * the page and registers no `versionchange` handler, so it never yields to
 * `indexedDB.deleteDatabase`: the delete stays queued forever, and — per the
 * IndexedDB spec's connection queue — every later `open` on that name queues
 * behind it and never settles. A cache instance would thus make its database
 * name undeletable until the page goes away (#440). With a per-operation
 * connection that also yields on `versionchange` (see {@link openConnection}),
 * a concurrent delete waits at most for the in-flight transaction to finish.
 *
 * Concurrent operations each get their own connection, so one operation
 * finishing (and closing) can never break another that is still running.
 */
function perOperationStore(dbName: string, storeName: string): UseStore {
    return (txMode, callback) =>
        openConnection(dbName, storeName).then((db) => {
            try {
                const operation = callback(
                    db.transaction(storeName, txMode).objectStore(storeName),
                );
                // `close()` only sets the close-pending flag while a
                // transaction is live; the connection actually closes once the
                // transaction finishes, so closing here never aborts the work.
                // `finally` guarantees the close is requested before the
                // awaiting caller resumes, so a delete issued right after an
                // operation settles finds no connection still open.
                return Promise.resolve(operation).finally(() => db.close());
            } catch (error) {
                db.close();
                throw error;
            }
        });
}

function openConnection(
    dbName: string,
    storeName: string,
): Promise<IDBDatabase> {
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    // `blocked` cannot fire on this request: a versionless open performs an
    // upgrade only when it creates the database, and a database that does not
    // exist has no connections to block on. (`promisifyRequest` ignores
    // `blocked` and would simply keep waiting for `success` if it ever fired.)
    return promisifyRequest(request).then((db) => {
        // Yield to a concurrent `deleteDatabase` or versioned open — the
        // spec's mechanism whose absence in idb-keyval caused #440. With
        // per-operation connections this shrinks a racing delete's wait to
        // the end of the current transaction; more importantly, it keeps the
        // connection well-behaved should connection reuse ever be
        // reintroduced, so #440 cannot silently return. The handler can only
        // fire after the operation's transaction exists (event dispatch needs
        // a task boundary; the transaction is created in this microtask
        // chain), and closing never aborts it — see perOperationStore.
        db.onversionchange = () => db.close();
        return db;
    });
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
 * Because the cache key does not encode the identity, **give the store a
 * per-identity namespace** to keep one identity's persisted keys from being
 * served to another on the same origin — e.g. include the caller's principal in
 * the database name:
 *
 * ```ts
 * new IndexedDbDerivedKeyMaterialCache(`vetkeys-${principal}`);
 * ```
 *
 * A dedicated IndexedDB store is used, so {@link clear} only removes entries
 * written by this cache and never touches other application data.
 *
 * The cache opens a connection per operation and closes it when the operation
 * settles, so it never blocks `indexedDB.deleteDatabase` beyond an in-flight
 * operation. An application may therefore delete a per-identity database
 * outright on logout — {@link destroy} does exactly that — removing not just
 * the entries ({@link clear}) but also the database name, which itself records
 * that the identity has used the application on that browser profile. If the
 * database is deleted while a cache instance is live, the next operation
 * simply recreates it empty; the cost is one extra key derivation per map.
 */
export class IndexedDbDerivedKeyMaterialCache implements DerivedKeyMaterialCache {
    readonly #store: UseStore;

    /** The IndexedDB database name this cache reads and writes. */
    readonly dbName: string;

    /**
     * @param dbName - IndexedDB database name. Defaults to `"ic-vetkeys"`. This
     *   is the isolation knob: give each identity its own database name (e.g.
     *   `` `vetkeys-${principal}` ``) so one identity's persisted keys are never
     *   served to another. The object store name is fixed, because `idb-keyval`
     *   supports only a single object store per database.
     */
    constructor(dbName = "ic-vetkeys") {
        this.dbName = dbName;
        this.#store = perOperationStore(dbName, "derived-key-material");
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

    /**
     * Deletes the entire database. Unlike {@link clear}, which only empties
     * the object store, this also removes the database name itself — which is
     * what records that an identity has used the application on this browser
     * profile when the per-identity naming above is followed.
     *
     * A delete issued while an operation is in flight completes as soon as
     * that operation's connection closes. Calling `destroy()` twice is a
     * no-op; a later {@link get} or {@link set} simply recreates the database
     * empty.
     */
    async destroy(): Promise<void> {
        // `promisifyRequest` ignores `blocked`, which is deliberate here:
        // `blocked` means an operation's connection is still open, and with
        // per-operation connections that state is transient — the connection
        // closes as the operation settles (or on `versionchange`, which this
        // very delete fires) and `success` follows. Resolving on `blocked`
        // instead would report completion before the database is gone.
        await promisifyRequest(indexedDB.deleteDatabase(this.dbName));
    }
}
