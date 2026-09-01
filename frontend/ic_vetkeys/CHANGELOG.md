# Change Log

## [Unreleased]

### Added

- `IndexedDbDerivedKeyMaterialCache.destroy()` deletes the entire database —
  unlike `clear()`, which only empties the object store — and
  `IndexedDbDerivedKeyMaterialCache.dbName` exposes the database name the
  cache was constructed with. Together they make the recommended
  logout cleanup of a per-identity database a single call.

### Changed

- The bulk decryption paths (`getValuesForMap`, `getAllAccessibleValues`,
  `getAllAccessibleMaps`) now fetch the per-map derived key material once per
  non-empty map instead of once per entry. With the per-operation IndexedDB
  cache below, a map with N entries previously performed N cache reads for
  the same key material; it now performs one (and none for an empty map).

### Fixed

- `IndexedDbDerivedKeyMaterialCache` no longer holds its IndexedDB connection
  open for the lifetime of the page. It now opens a connection per operation,
  closes it as soon as the operation settles, and yields on `versionchange`,
  so the cache never blocks `indexedDB.deleteDatabase` on its database name
  (beyond an in-flight transaction) and a queued delete can no longer stall
  every later `open` on that name indefinitely. Applications can now delete a per-identity database
  outright on logout; if the database is deleted while a cache instance is
  live, the next operation recreates it empty (one extra key derivation per
  map). (#440)

## [0.7.0] - 2026-08-26

### Changed

- **BREAKING** `@icp-sdk/core` is now a **peer dependency** (`^5.0.0 || ^6.0.0`)
  instead of a regular dependency. Install it alongside this package:

    ```bash
    npm install @icp-sdk/vetkeys @icp-sdk/core
    ```

    A core version outside that range is now reported at install time instead of
    silently resolving to a second copy of core.

- **BREAKING** Runtime dependencies (`@icp-sdk/core`, `@noble/curves`,
  `@noble/hashes`, `idb-keyval`) are no longer bundled into `dist/`; they are
  imported from your `node_modules`. `dist/lib` shrinks from ~430 kB to ~56 kB.

- `@noble/curves` and `@noble/hashes` moved from `devDependencies` to
  `dependencies`.

## [0.6.0] - 2026-08-26

### Changed

- **BREAKING** `@icp-sdk/core` is now required at `^6.1.0` (was `^5.4.0`).
  No `@icp-sdk/vetkeys` API changed, but the `HttpAgent` passed to
  `DefaultKeyManagerClient` / `DefaultEncryptedMapsClient` must come from core
  v6 — mixing a v5 agent with this version is not supported. Upgrade
  `@icp-sdk/core` to `^6.1.0` in your application alongside this release.
  See the [`@icp-sdk/core` changelog](https://github.com/dfinity/icp-js-core/blob/main/CHANGELOG.md)
  for the core-side breaking changes (notably the revamped `Agent.readState`
  and the narrowed `DerEncodedPublicKey` type); neither is used by this
  package's public API.
- Bumped `idb-keyval` to `^6.3.0`.

### Security

- Refreshed the dependency lockfile, clearing all 29 `pnpm audit` advisories
  (`brace-expansion`, `esbuild`, `fast-uri`, `js-yaml`, `linkify-it`,
  `markdown-it`, `nanoid`, `postcss`, `vite`). All were in build/test tooling
  only and never reached the published `dist/`, so no shipped code changed.

## [0.5.0] - 2026-07-28

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
  sessions otherwise.

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
- The derived key material cache now belongs to a single identity rather than
  being shared in a fixed IndexedDB store across identities. Because derived key
  material is per map (`[mapOwner, mapName]`), cross-identity isolation is a
  property of the cache instance: use a fresh `EncryptedMaps` instance per
  identity with the in-memory default, or give `IndexedDbDerivedKeyMaterialCache`
  a per-identity namespace (e.g. include the caller's principal in the database
  name). This closes the prior behaviour where, after an identity switch on the
  same origin, key material cached by one principal could be served to another.
- **Upgrade note:** versions `0.1.0`–`0.4.0` persisted derived key material to
  IndexedDB's default `idb-keyval` store. After upgrading, those entries remain
  at rest and are neither used nor cleared by this version (the new cache uses a
  dedicated store). To remove the residual decryption capability, clear the
  legacy entries once after upgrading — e.g. via the already-bundled `idb-keyval`:

    ```ts
    import { entries, del } from "idb-keyval";
    // Delete only the legacy vetkeys entries from idb-keyval's default store,
    // matching the legacy key shape `[mapOwner: string, mapName: bytes]` with a
    // CryptoKey value, leaving any other app data untouched. IndexedDB does not
    // preserve the exact JS type of binary *keys* (a Uint8Array stored as a key
    // is read back as an ArrayBuffer), so match any binary key element.
    for (const [key, value] of await entries()) {
        if (
            Array.isArray(key) &&
            key.length === 2 &&
            typeof key[0] === "string" &&
            (key[1] instanceof ArrayBuffer || ArrayBuffer.isView(key[1])) &&
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
