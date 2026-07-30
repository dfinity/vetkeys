# ic-vetkeys-encrypted-maps-custom-canister

A reference canister for the `custom_value_endpoints` form of the
[`export_encrypted_maps_canister!`](https://docs.rs/ic-vetkeys/latest/ic_vetkeys/macro.export_encrypted_maps_canister.html)
macro.

Unlike [`ic-vetkeys-encrypted-maps-canister`](../ic_vetkeys_encrypted_maps_canister),
which exposes the full EncryptedMaps interface, this canister generates only the
control-plane endpoints (vetKD keys, access control, map-name enumeration) plus
the state, lifecycle hooks, and the `with_encrypted_maps`/`with_encrypted_maps_mut`
accessors, and provides its own value read/write endpoints.

This is the pattern for dapps that keep state linked to each encrypted value
(e.g. a metadata row per entry) and therefore must own the value endpoints to
keep the two stores consistent — see `password_manager_with_metadata` in
[dfinity/examples](https://github.com/dfinity/examples). The endpoints here are
kept minimal (a plain insert/get against the accessor) to exercise the macro
form; they are not a full metadata implementation.
