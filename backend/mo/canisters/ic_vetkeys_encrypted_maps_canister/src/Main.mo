import EncryptedMapsCanister "mo:ic-vetkeys/encrypted_maps/Canister";
import EncryptedMaps "mo:ic-vetkeys/encrypted_maps/EncryptedMaps";
import Types "mo:ic-vetkeys/Types";
import Runtime "mo:core/Runtime";

// This canister is a thin reference wrapper around the `ic-vetkeys`
// EncryptedMaps library. The canister owns its stable state and passes it to the
// library mixin, which provides the entire interface — guaranteeing the exposed
// Candid matches what the `@icp-sdk/vetkeys` frontend expects.
//
// The vetKD key name is read from the `VETKD_KEY_NAME` canister environment
// variable (set at deploy time via canister settings), so no actor class /
// install argument is needed. Trap rather than default to any key.
persistent actor {
    let keyName = switch (Runtime.envVar<system>("VETKD_KEY_NAME")) {
        case (?name) { name };
        case null {
            Runtime.trap("the VETKD_KEY_NAME canister environment variable is not set");
        };
    };
    let encryptedMapsState = EncryptedMaps.newEncryptedMapsState<Types.AccessRights>(
        { curve = #bls12_381_g2; name = keyName },
        "password_manager_example_app",
    );
    include EncryptedMapsCanister(encryptedMapsState);
};
