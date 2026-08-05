# Change Log

## [0.6.0] - Unreleased

### Breaking changes

- Now requires `moc` 1.13.0 (raised from 1.6.0), for actor mixin support
  including mixin composition (nested `include`, fixed in `moc` 1.11.1).
- Now requires `mo:core` 2.6.1 (raised from 2.4.0).

### Added

- `EncryptedMapsCanister` mixin (`mo:ic-vetkeys/encrypted_maps/Canister`) that
  provides a complete EncryptedMaps canister interface. The canister declares its
  own `EncryptedMapsState` stable variable and passes it to the mixin via
  `include EncryptedMapsCanister(encryptedMapsState)`, which adds every
  shared/query endpoint — so an adopter's `Main.mo` is a few lines instead of
  ~200 lines of hand-written delegation. Because the mixin is the single source of
  the endpoint set, the exposed Candid matches what the `@icp-sdk/vetkeys`
  frontend expects by construction. Keeping the state in the actor body (rather
  than inside the mixin) keeps it a plain, visible stable variable the canister
  owns and can migrate. Where the vetKD key name comes from is the adopter's
  choice; the reference canisters read it from a `VETKD_KEY_NAME` canister
  environment variable (set at deploy time via canister settings, trapping if
  unset), so no actor class or install argument is needed — a plain `persistent
  actor` works, which is compatible with enhanced migration.
- `EncryptedMapsControlPlaneCanister` mixin
  (`mo:ic-vetkeys/encrypted_maps/ControlPlaneCanister`) for the "wrap-and-extend"
  pattern: given the caller's `EncryptedMapsState`, it provides the `encryptedMaps`
  instance and the control-plane endpoints (vetKD keys, access control, map-name
  enumeration) but **not** the value read/write endpoints. `include` it into a
  `persistent actor` when the canister keeps state linked to each value (e.g. a
  metadata row per entry) and must own the value endpoints to keep the two stores
  consistent. The full `EncryptedMapsCanister` mixin is this mixin plus the value
  endpoints.

## [0.5.0] - 2026-04-22

### Breaking changes

- Migrated the library from the deprecated `mo:base` to `mo:core` 2.4.0. Public types such as `KeyManagerState` and `EncryptedMapsState` now reference `mo:core/pure/Map.Map` instead of `mo:base/OrderedMap`; downstream code that constructs or inspects these state records must be updated accordingly.
- Now requires `moc` 1.6.0 and `mo:core` 2.4.0, declared via the new `[toolchain]` section in `mops.toml`.
 
### Changed

- Internal refactoring to align with `mo:core` conventions and modern Motoko style.

## [0.4.0] - 2025-09-29

### Breaking changes

- Fixed an inconsistency with the Rust backend in the signature format returned by `ManagementCanister.signWithBls`. Before, we returned the full response from `vetkd_derive_key` while we only need the last 48 bytes, which is the signature. Also, added a check to `signWithBls` which traps if the provided vetKD key id is not `#bls12_381_g2`.

- Fixed an inconsistency with the Rust backend in the returned text error messages. Two error messages were starting with a capital instead of small letter. This is now fixed.

- Extract state to state structures to separate the data from the state. This enables enhanced orthogonal persistence by declaring actors to be `persistent`.

## [0.3.0] - 2025-06-30

### Breaking changes

- Fixed a few inconsistencies with the Rust backend of encrypted maps. 

### Changed

- Updates dependencies.

### Added
- Sign with BLS and VetKD helper functions.

## [0.2.0] - 2025-06-18

### Fixed
- Links in code docs.
- Repository in mops.toml.

## [0.1.0] - 2025-06-11

Initial release