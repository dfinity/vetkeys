# Change Log

## [0.7.0] - 2026-08-26

### Changed

- **BREAKING** `@icp-sdk/core` is now a **`peerDependency`** (`^5.0.0 || ^6.0.0`)
  instead of a regular dependency. **You must now install `@icp-sdk/core`
  yourself** alongside this package:

    ```bash
    npm install @icp-sdk/vetkeys @icp-sdk/core
    ```

    Core is a shared-singleton library whose classes cross this package's public
    API — `DefaultKeyManagerClient` and `DefaultEncryptedMapsClient` take an
    `HttpAgent` that _you_ construct. As a plain dependency, npm was free to
    install a second copy of core nested under `@icp-sdk/vetkeys` without any
    warning, which put two different `HttpAgent` / `Principal` identities in one
    application. As a peer, that conflict is reported at install time instead.
    This also matches `@icp-sdk/auth`, `@icp-sdk/signer` and `@icp-sdk/canisters`,
    which already declare core as a peer.

    The range deliberately spans both majors: this package uses only
    `Actor.createActor` and the candid `IDL`, which are unchanged across core v5
    and v6, so it can sit in an application that is still on core v5. CI runs the
    full canister test suite against both ends of the range.

- **BREAKING** Runtime dependencies are no longer bundled into `dist/`. The
  build previously inlined `@icp-sdk/core`, `idb-keyval`, `@noble/curves` and
  `@noble/hashes` into the published output, so every install shipped a private
  copy of core regardless of what was in `node_modules`. They are now external
  imports resolved from your `node_modules`. This shrinks `dist/lib` from
  ~430 kB to ~56 kB, and means the candid `IDL` used to build the actor
  interface now comes from the same core instance as the agent you pass in.

- `@noble/curves` and `@noble/hashes` moved from `devDependencies` to
  `dependencies`. They are imported by shipped code, so declaring them as dev
  dependencies was incorrect — it only worked because the build inlined them.
  As real dependencies they are installed normally and can be patched by
  consumers, rather than being vendored into this package's output.

### Notes

- `idb-keyval` stays a regular dependency. It is a genuine implementation
  detail: no idb-keyval value crosses the public API (the cache constructor
  takes a database _name_), and IndexedDB is keyed by origin, database and
  store name, so even two copies address the same physical store.

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
