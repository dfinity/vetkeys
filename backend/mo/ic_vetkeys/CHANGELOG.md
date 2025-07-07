# Change Log

## [Unreleased]

- BREAKING CHANGE: Fixed an inconsistency with the Rust backend in the signature format returned by `ManagementCanister.signWithBls`. Before, we returned the full response from `vetkd_derive_key` while we only need the last 48 bytes, which is the signature. Also, added a check to `signWithBls` which traps if the provided vetKD key id is not `#bls12_381_g2`.

## [0.3.0] - 2025-06-30

- BREAKING CHANGE: Fixed a few inconsistencies with the Rust backend of encrypted maps. 

### Changed

- Updates dependencies.

### Adds
- Sign with BLS and VetKD helper functions.

## [0.2.0] - 2025-06-18

### Fixes
- Links in code docs.
- Repository in mops.toml.

## [0.1.0] - 2025-06-11

Initial release