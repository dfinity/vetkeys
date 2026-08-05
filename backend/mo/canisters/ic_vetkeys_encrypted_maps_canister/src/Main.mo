import EncryptedMapsCanister "mo:ic-vetkeys/encrypted_maps/Canister";

// This canister is a thin reference wrapper around the `ic-vetkeys`
// EncryptedMaps library. The entire canister interface is provided by the
// library mixin, which guarantees the exposed Candid matches what the
// `@icp-sdk/vetkeys` frontend expects.
//
// The vetKD key name is read from the `VETKD_KEY_NAME` canister environment
// variable (set at deploy time via canister settings), so no actor class /
// install argument is needed.
persistent actor {
    include EncryptedMapsCanister<system>("password_manager_example_dapp");
};
