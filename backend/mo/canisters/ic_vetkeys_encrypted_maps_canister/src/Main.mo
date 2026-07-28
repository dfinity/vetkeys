import EncryptedMapsCanister "mo:ic-vetkeys/encrypted_maps/Canister";

// This canister is a thin reference wrapper around the `ic-vetkeys`
// EncryptedMaps library. The entire canister interface is provided by the
// library mixin, which guarantees the exposed Candid matches what the
// `@icp-sdk/vetkeys` frontend expects.
persistent actor class (keyName : Text) {
    include EncryptedMapsCanister(keyName, "password_manager_example_dapp");
};
