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
