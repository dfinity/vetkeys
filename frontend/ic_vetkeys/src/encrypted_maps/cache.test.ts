import { describe, expect, test, vi } from "vitest";
import { Principal } from "@icp-sdk/core/principal";
import { DerivedKeyMaterial } from "../utils/utils";
import {
    EncryptedMaps,
    InMemoryDerivedKeyMaterialCache,
    IndexedDbDerivedKeyMaterialCache,
    type EncryptedMapsClient,
} from "./index";

/**
 * Builds a `DerivedKeyMaterial` backed by a fresh, non-extractable HKDF key,
 * matching what the canister flow produces — without needing a replica.
 */
async function newDerivedKeyMaterial(
    seed: number,
): Promise<DerivedKeyMaterial> {
    const keyBytes = new Uint8Array(32).fill(seed);
    const raw = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        "HKDF",
        false, // non-extractable
        ["deriveKey", "deriveBits"],
    );
    return DerivedKeyMaterial.fromCryptoKey(raw);
}

const OWNER_A = Principal.fromText("aaaaa-aa");
const OWNER_B = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

/**
 * The caching path never calls the canister client (key derivation is stubbed
 * via `getDerivedKeyMaterial`), so a bare object suffices.
 */
function emptyClient(): EncryptedMapsClient {
    return {} as unknown as EncryptedMapsClient;
}

describe("InMemoryDerivedKeyMaterialCache", () => {
    test("round-trips a stored key handle", async () => {
        const cache = new InMemoryDerivedKeyMaterialCache();
        const dkm = await newDerivedKeyMaterial(1);
        const key = dkm.getCryptoKey();

        expect(await cache.get("k")).toBeUndefined();
        await cache.set("k", key);
        expect(await cache.get("k")).toBe(key);
    });

    test("clear() drops all entries", async () => {
        const cache = new InMemoryDerivedKeyMaterialCache();
        await cache.set("k", (await newDerivedKeyMaterial(1)).getCryptoKey());
        await cache.clear();
        expect(await cache.get("k")).toBeUndefined();
    });
});

describe("IndexedDbDerivedKeyMaterialCache", () => {
    test("persists a non-extractable key handle that cannot be exported", async () => {
        // Use a unique database per test to avoid cross-test interference.
        const cache = new IndexedDbDerivedKeyMaterialCache(
            "ic-vetkeys-test-persist",
        );
        const key = (await newDerivedKeyMaterial(7)).getCryptoKey();

        await cache.set("k", key);
        const restored = await cache.get("k");
        if (!restored) throw new Error("expected a cached key handle");
        expect(restored.extractable).toBe(false);
        // The raw bytes must remain unrecoverable even after persistence.
        await expect(
            crypto.subtle.exportKey("raw", restored),
        ).rejects.toThrow();
    });

    test("clear() empties the store", async () => {
        const cache = new IndexedDbDerivedKeyMaterialCache(
            "ic-vetkeys-test-clear",
        );
        await cache.set("k", (await newDerivedKeyMaterial(7)).getCryptoKey());
        expect(await cache.get("k")).toBeDefined();
        await cache.clear();
        expect(await cache.get("k")).toBeUndefined();
    });

    test("different namespaces are isolated", async () => {
        // Per-identity namespacing (e.g. `vetkeys-<principal>`) is how persisted
        // key material is kept separate between identities on the same origin.
        const a = new IndexedDbDerivedKeyMaterialCache("ic-vetkeys-test-ns-a");
        const b = new IndexedDbDerivedKeyMaterialCache("ic-vetkeys-test-ns-b");
        await a.set("k", (await newDerivedKeyMaterial(7)).getCryptoKey());

        expect(await a.get("k")).toBeDefined();
        expect(await b.get("k")).toBeUndefined();
    });
});

describe("EncryptedMaps derived key caching", () => {
    test("fetches once, then serves subsequent calls from cache", async () => {
        const maps = new EncryptedMaps(emptyClient());
        const fetchSpy = vi
            .spyOn(maps, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(1));
        const mapName = new TextEncoder().encode("some map");

        await maps.getDerivedKeyMaterialOrFetchIfNeeded(OWNER_A, mapName);
        await maps.getDerivedKeyMaterialOrFetchIfNeeded(OWNER_A, mapName);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("distinguishes maps by owner", async () => {
        const maps = new EncryptedMaps(emptyClient());
        const fetchSpy = vi
            .spyOn(maps, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(1));
        const mapName = new TextEncoder().encode("some map");

        await maps.getDerivedKeyMaterialOrFetchIfNeeded(OWNER_A, mapName);
        await maps.getDerivedKeyMaterialOrFetchIfNeeded(OWNER_B, mapName);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("distinguishes maps that share a prefix in their names", async () => {
        const maps = new EncryptedMaps(emptyClient());
        const fetchSpy = vi
            .spyOn(maps, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(1));

        await maps.getDerivedKeyMaterialOrFetchIfNeeded(
            OWNER_A,
            Uint8Array.from([1]),
        );
        await maps.getDerivedKeyMaterialOrFetchIfNeeded(
            OWNER_A,
            Uint8Array.from([1, 2]),
        );

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("separate instances do not share an in-memory cache", async () => {
        // Distinct identities are expected to use distinct EncryptedMaps
        // instances; their in-memory caches must be independent so one
        // identity's key material is never served to another.
        const first = new EncryptedMaps(emptyClient());
        const second = new EncryptedMaps(emptyClient());
        const firstSpy = vi
            .spyOn(first, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(1));
        const secondSpy = vi
            .spyOn(second, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(2));
        const mapName = new TextEncoder().encode("some map");

        await first.getDerivedKeyMaterialOrFetchIfNeeded(OWNER_A, mapName);
        await second.getDerivedKeyMaterialOrFetchIfNeeded(OWNER_A, mapName);

        expect(firstSpy).toHaveBeenCalledTimes(1);
        expect(secondSpy).toHaveBeenCalledTimes(1);
    });

    test("clearCache() forces a re-fetch", async () => {
        const maps = new EncryptedMaps(emptyClient());
        const fetchSpy = vi
            .spyOn(maps, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(1));
        const mapName = new TextEncoder().encode("some map");

        await maps.getDerivedKeyMaterialOrFetchIfNeeded(OWNER_A, mapName);
        await maps.clearCache();
        await maps.getDerivedKeyMaterialOrFetchIfNeeded(OWNER_A, mapName);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("a cache hit still yields working key material", async () => {
        const shared = await newDerivedKeyMaterial(42);
        const maps = new EncryptedMaps(emptyClient());
        vi.spyOn(maps, "getDerivedKeyMaterial").mockResolvedValue(shared);
        const mapName = new TextEncoder().encode("some map");

        const plaintext = new TextEncoder().encode("hello");
        const ciphertext = await maps.encryptFor(
            OWNER_A,
            mapName,
            new TextEncoder().encode("k"),
            plaintext,
        );
        // Second call resolves the key material from cache, not the fetch.
        const decrypted = await maps.decryptFor(
            OWNER_A,
            mapName,
            new TextEncoder().encode("k"),
            ciphertext,
        );

        expect(decrypted).toEqual(plaintext);
    });
});
