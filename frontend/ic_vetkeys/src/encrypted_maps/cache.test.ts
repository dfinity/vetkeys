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

const PRINCIPAL_A = Principal.fromText("aaaaa-aa");
const PRINCIPAL_B = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

/**
 * Minimal client that only supports the calls the caching path needs. The
 * remaining `EncryptedMapsClient` methods are never invoked in these tests.
 */
function mockClient(caller: Principal): EncryptedMapsClient {
    return {
        getCallerPrincipal: vi.fn(async () => caller),
    } as unknown as EncryptedMapsClient;
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
            "store",
        );
        const key = (await newDerivedKeyMaterial(7)).getCryptoKey();

        await cache.set("k", key);
        const restored = await cache.get("k");
        expect(restored).toBeDefined();
        expect(restored?.extractable).toBe(false);
        // The raw bytes must remain unrecoverable even after persistence.
        await expect(
            crypto.subtle.exportKey("raw", restored as CryptoKey),
        ).rejects.toThrow();
    });

    test("clear() empties the store", async () => {
        const cache = new IndexedDbDerivedKeyMaterialCache(
            "ic-vetkeys-test-clear",
            "store",
        );
        await cache.set("k", (await newDerivedKeyMaterial(7)).getCryptoKey());
        expect(await cache.get("k")).toBeDefined();
        await cache.clear();
        expect(await cache.get("k")).toBeUndefined();
    });
});

describe("EncryptedMaps derived key caching", () => {
    test("fetches once, then serves subsequent calls from cache", async () => {
        const maps = new EncryptedMaps(mockClient(PRINCIPAL_A));
        const fetchSpy = vi
            .spyOn(maps, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(1));
        const mapName = new TextEncoder().encode("some map");

        await maps.getDerivedKeyMaterialOrFetchIfNeeded(PRINCIPAL_A, mapName);
        await maps.getDerivedKeyMaterialOrFetchIfNeeded(PRINCIPAL_A, mapName);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("does not serve a key cached by a different caller (caller-scoped)", async () => {
        const client = mockClient(PRINCIPAL_A);
        const maps = new EncryptedMaps(client);
        const fetchSpy = vi
            .spyOn(maps, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(1));
        const mapName = new TextEncoder().encode("some map");

        // Caller A populates the cache.
        await maps.getDerivedKeyMaterialOrFetchIfNeeded(PRINCIPAL_A, mapName);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        // The authenticated identity changes to B on the same instance.
        (
            client.getCallerPrincipal as ReturnType<typeof vi.fn>
        ).mockResolvedValue(PRINCIPAL_B);

        // Same map owner + name, but B must NOT get A's cached key.
        await maps.getDerivedKeyMaterialOrFetchIfNeeded(PRINCIPAL_A, mapName);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("distinguishes maps that share a prefix in their names", async () => {
        const maps = new EncryptedMaps(mockClient(PRINCIPAL_A));
        const fetchSpy = vi
            .spyOn(maps, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(1));

        await maps.getDerivedKeyMaterialOrFetchIfNeeded(
            PRINCIPAL_A,
            Uint8Array.from([1]),
        );
        await maps.getDerivedKeyMaterialOrFetchIfNeeded(
            PRINCIPAL_A,
            Uint8Array.from([1, 2]),
        );

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("clearCache() forces a re-fetch", async () => {
        const maps = new EncryptedMaps(mockClient(PRINCIPAL_A));
        const fetchSpy = vi
            .spyOn(maps, "getDerivedKeyMaterial")
            .mockImplementation(() => newDerivedKeyMaterial(1));
        const mapName = new TextEncoder().encode("some map");

        await maps.getDerivedKeyMaterialOrFetchIfNeeded(PRINCIPAL_A, mapName);
        await maps.clearCache();
        await maps.getDerivedKeyMaterialOrFetchIfNeeded(PRINCIPAL_A, mapName);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("a cache hit still yields working key material", async () => {
        const shared = await newDerivedKeyMaterial(42);
        const maps = new EncryptedMaps(mockClient(PRINCIPAL_A));
        vi.spyOn(maps, "getDerivedKeyMaterial").mockResolvedValue(shared);
        const mapName = new TextEncoder().encode("some map");

        const plaintext = new TextEncoder().encode("hello");
        const ciphertext = await maps.encryptFor(
            PRINCIPAL_A,
            mapName,
            new TextEncoder().encode("k"),
            plaintext,
        );
        // Second call resolves the key material from cache, not the fetch.
        const decrypted = await maps.decryptFor(
            PRINCIPAL_A,
            mapName,
            new TextEncoder().encode("k"),
            ciphertext,
        );

        expect(decrypted).toEqual(plaintext);
    });
});
