# Change Log

## [0.5.0] - Unreleased

> **Note:** Starting with this version, the package is published as `@icp-sdk/vetkeys`.
> Versions 0.1.0–0.4.0 were published as [`@dfinity/vetkeys`](https://www.npmjs.com/package/@dfinity/vetkeys).

### Added

- Make `deriveSymmetricKey` non-`@internal`.
- `DerivedKeyMaterial` encryption now supports authenticated data
- `DerivedKeyMaterial` encryption uses a different format for encryption now.
  Decryption of old messages is supported, however older versions of this library
  will not be able to read messages encrypted by this or newer versions.
- `EncryptedMaps` now accepts an optional `{ cache }` option to control how
  derived key material is cached. New exports `DerivedKeyMaterialCache`,
  `InMemoryDerivedKeyMaterialCache`, and `IndexedDbDerivedKeyMaterialCache` from
  `@icp-sdk/vetkeys/encrypted_maps`.
- `EncryptedMaps.clearCache()` to drop cached derived key material. Strongly
  recommended on logout or identity change to drop usable decryption capability
  — especially with `IndexedDbDerivedKeyMaterialCache`, where it persists across
  sessions otherwise. Not required for correctness, since cached keys are scoped
  to the caller.

### Security

- **BREAKING** `EncryptedMaps` no longer persists derived key material to
  IndexedDB by default; it now caches in memory only
  (`InMemoryDerivedKeyMaterialCache`), so secret-bearing key handles are
  discarded on page reload instead of remaining usable at rest indefinitely.
  Opt back into persistence with
  `new EncryptedMaps(client, { cache: new IndexedDbDerivedKeyMaterialCache() })`,
  accepting that a persisted handle can be used by any same-origin code to
  decrypt without an authenticated session. The one-time cost of the default is
  an extra key derivation per map per page load.
- Cached derived key material is now scoped to the authenticated caller's
  principal. Previously the cache key was only `[mapOwner, mapName]`, so after an
  identity switch on the same origin a different principal could receive key
  material cached by a prior one. `EncryptedMapsClient` gains a
  `get_caller_principal()` method to support this; custom implementations must add it.
- **Upgrade note:** versions `0.1.0`–`0.4.0` persisted derived key material to
  IndexedDB's default `idb-keyval` store. After upgrading, those entries remain
  at rest and are neither used nor cleared by this version (the new cache uses a
  dedicated store). To remove the residual decryption capability, clear the
  legacy entries once after upgrading — e.g. via the already-bundled `idb-keyval`:

    ```ts
    import { entries, del } from "idb-keyval";
    // Delete only the legacy vetkeys entries from idb-keyval's default store,
    // matching the exact legacy key shape `[mapOwner: string, mapName: Uint8Array]`
    // with a CryptoKey value, leaving any other app data untouched.
    for (const [key, value] of await entries()) {
        if (
            Array.isArray(key) &&
            key.length === 2 &&
            typeof key[0] === "string" &&
            key[1] instanceof Uint8Array &&
            value instanceof CryptoKey
        ) {
            await del(key);
        }
    }
    ```

### Changed

- **BREAKING** `DefaultEncryptedMapsClient` and `DefaultKeyManagerClient`
  constructors now accept an `HttpAgent` (from `@icp-sdk/core/agent`) instead of
  `HttpAgentOptions`. Since `HttpAgent.create()` is async, the agent must be
  created by the caller before being passed in — this avoids the deprecated
  `new HttpAgent(options)` constructor and allows full configuration upfront,
  including providing the network's root key for local development:

    ```ts
    const agent = await HttpAgent.create({
        host,
        identity,
        ...(rootKey ? { rootKey } : {}), // rootKey from ic_env cookie in local dev
    });
    new DefaultEncryptedMapsClient(agent, canisterId);
    ```

- Make `DerivedKeyMaterial.deriveAesGcmCryptoKey` `@internal`.

### Fixed

- Updated `@noble/curves` and `@noble/hashes` usages to current non-deprecated APIs.
  The exported `G1Point` and `G2Point` types now resolve to `WeierstrassPoint` instead
  of the deprecated `ProjPointType` alias.
- Resolved TypeScript 5.9 compatibility: tightened internal `Uint8Array` generics (`Uint8Array<ArrayBuffer>`) to satisfy the stricter Web Crypto and IndexedDB type definitions shipped in TypeScript 5.9.

## [0.4.0] - 2025-08-04

### Added

- Added MasterPublicKey.productionKey which allows accessing the production public keys

- Added IbeCiphertext plaintextSize and ciphertextSize helpers

- Add VrfOutput type for using VetKeys as a Verifiable Random Function

### Changed

- Bump `@dfinity` agent-related packages to major version `3`.

## [0.3.0] - 2025-06-30

### Changed

- Added isValidTransportPublicKey function

- Improved code docs.

- Added `deserialize` methods.

- Updated dependencies.

## [0.2.0] - 2025-06-08

### Fixed

- Links in code docs.

### Changed

- The code docs now live on github.io.
- Replaces some instances of `window` with `globalThis` in a few places for better node compatibility.

## [0.1.0] - 2025-05-27

Initial release
