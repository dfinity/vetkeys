# ic-vetkeys-encrypted-maps-canister

The canister implemented in this folder directly exposes the methods of the encrypted maps.
This is useful for:

1. running canister tests
2. implementing apps that only require encrypted maps

It uses the full form of the [`export_encrypted_maps_canister!`](https://docs.rs/ic-vetkeys/latest/ic_vetkeys/macro.export_encrypted_maps_canister.html) macro. If your app keeps state linked to each value and needs to provide its own value endpoints, see [`ic-vetkeys-encrypted-maps-custom-canister`](../ic_vetkeys_encrypted_maps_custom_canister) and the macro's `custom_value_endpoints` form.