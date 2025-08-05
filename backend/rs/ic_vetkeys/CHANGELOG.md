# Change Log

## [0.4.0] - 2025-08-04

### Breaking changes

- Bumped `ic-stable-structures` to `v0.7.0`.

### Added

- Added MasterPublicKey::for_mainnet_key which allows accessing the production public keys

- Added IbeCiphertext plaintext_size and ciphertext_size helpers

- Add VrfOutput type for using VetKeys as a Verifiable Random Function

- `derive(Deserialize)` for `EncryptedMapData`

### Changed

- Set MSRV to 1.85

## [0.3.0] - 2025-06-30

### Added

- An additional sanity check that the public key is not the identity.

### Changed

- Improved docs.

- Added zeroization of the used memory.

- Updated dependencies.

## [0.2.0] - 2025-06-08

### Breaking Changes

- Changed error types of `crate::management_canister::{bls_public_key, sign_with_bls}`.

### Fixed

- Links in code docs.

### Changed

- Bumped `ic_cdk` to `v0.18.3`. Due to this update, the internally dispatched `vetkd_derive_key` calls now attach exactly the needed the amount of cycles (and not sometimes more cycles as it was the case before) because the new version of `ic_cdk` determines the cost by using the `ic0_cost_vetkd_derive_key` endpoint.

## [0.1.0] - 2025-05-27

Initial release
