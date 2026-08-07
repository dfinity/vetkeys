import EncryptedMapsCanister "mo:ic-vetkeys/encrypted_maps/Canister";
import EncryptedMaps "mo:ic-vetkeys/encrypted_maps/EncryptedMaps";
import Types "mo:ic-vetkeys/Types";
import Runtime "mo:core/Runtime";

// This canister is a thin reference wrapper around the `ic-vetkeys`
// EncryptedMaps library. The canister owns its stable state and passes it to the
// library mixin, which provides the entire interface — guaranteeing the exposed
// Candid matches what the `@icp-sdk/vetkeys` frontend expects.
//
// The vetKD key name is only ever an install-time input: it is captured here
// into the (stable) `EncryptedMapsState` below and never read again, so it is
// `transient`. Do NOT change it once the canister holds data — the key name
// feeds vetKD key derivation, so changing it would make every already-encrypted
// value undecryptable. The only way to switch keys is a `reinstall`, which
// deliberately drops all state. Init stays total (no trap), so a failing env
// var can never leave the canister half-initialized.
//
// Defaults to `test_key_1` (the local/test key). Set the `VETKD_KEY_NAME`
// canister environment variable via canister settings at deploy time to pick a
// different key, e.g. `key_1`. Note: `test_key_1` is a valid mainnet key too, so
// a production deploy that forgets to set `VETKD_KEY_NAME` silently runs on it —
// assert the expected key at deploy time if that matters for your app.
persistent actor {
    transient let keyName = Runtime.envVar<system>("VETKD_KEY_NAME") ??"test_key_1";
    let encryptedMapsState = EncryptedMaps.newEncryptedMapsState<Types.AccessRights>(
        { curve = #bls12_381_g2; name = keyName },
        "password_manager_example_app",
    );
    include EncryptedMapsCanister(encryptedMapsState);
};
