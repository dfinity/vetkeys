# ic-vetkeys-encrypted-maps-custom-canister

A reference canister for the `EncryptedMapsControlPlaneCanister` mixin
(`mo:ic-vetkeys/encrypted_maps/ControlPlaneCanister`).

Unlike [`ic-vetkeys-encrypted-maps-canister`](../ic_vetkeys_encrypted_maps_canister),
which includes the full `EncryptedMapsCanister` mixin and exposes the complete
interface, this canister includes only the control-plane mixin (state, vetKD /
access-control / map-name endpoints, and the in-scope `encryptedMaps` object)
and provides its own value read/write endpoints.

This is the pattern for dapps that keep state linked to each encrypted value
(e.g. a metadata row per entry) and therefore must own the value endpoints to
keep the two stores consistent — see `password_manager_with_metadata` in
[dfinity/examples](https://github.com/dfinity/examples). The endpoints here are
kept minimal (a plain insert/get against `encryptedMaps`) to exercise the mixin;
they are not a full metadata implementation.
