# Change Log

## [0.2.0] - 08.06.2025

### Breaking Changes
- Changed error types of `crate::management_canister::{bls_public_key, sign_with_bls}`.

### Fixed
- Links in code docs.

### Changed
- Bumped `ic_cdk` to `v0.18.3`. Due to this update, the internally dispatched `vetkd_derive_key` calls now attach exactly the needed the amount of cycles (and not sometimes more cycles as it was the case before) because the new version of `ic_cdk` determines the cost by using the `ic0_cost_vetkd_derive_key` endpoint.

## [0.1.0] - 27-05-2025

Initial release