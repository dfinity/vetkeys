// Reference canister for the `EncryptedMapsControlPlaneCanister` mixin (the
// "wrap-and-extend" form). It includes the control-plane mixin — the state, the
// vetKD/access-control/enumeration endpoints, and the in-scope `encryptedMaps`
// object — but NOT the value read/write endpoints; the canister exposes its own.
// This is the pattern an app uses when it keeps state linked to each value (e.g.
// a metadata row per entry) and must own the value endpoints to keep that state
// consistent.
//
// This minimal example just re-implements a plain insert/get against
// `encryptedMaps` to exercise the surface; a full linked-metadata example lives
// in `password_manager_with_metadata` in dfinity/examples.
import EncryptedMapsControlPlaneCanister "mo:ic-vetkeys/encrypted_maps/ControlPlaneCanister";
import EncryptedMaps "mo:ic-vetkeys/encrypted_maps/EncryptedMaps";
import Types "mo:ic-vetkeys/Types";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Runtime "mo:core/Runtime";

persistent actor {
  // The canister owns its stable state. The vetKD key name is only an
  // install-time input: it is captured into the (stable) `EncryptedMapsState`
  // below and never read again, so it is `transient`. Do NOT change it once the
  // canister holds data — changing the key name would make every already-
  // encrypted value undecryptable; only a `reinstall` (which drops all state)
  // can switch keys. Init stays total (no trap). Defaults to `test_key_1`; set
  // the `VETKD_KEY_NAME` canister environment variable to pick another key.
  transient let keyName = Runtime.envVar<system>("VETKD_KEY_NAME") ??"test_key_1";
  let encryptedMapsState = EncryptedMaps.newEncryptedMapsState<Types.AccessRights>(
    { curve = #bls12_381_g2; name = keyName },
    "encrypted_maps_custom_app",
  );
  // Brings the control-plane endpoints and the `encryptedMaps`, `ByteBuf`, and
  // `Result` names into scope, over the state the canister owns above.
  include EncryptedMapsControlPlaneCanister(encryptedMapsState);

  // A canister-owned value write, wrapping the library's own via `encryptedMaps`.
  // This is where linked side-state (metadata, counters, …) would be maintained
  // in the same call — kept minimal here.
  //
  // `map_owner` + `map_name` identify the (namespaced) map, `map_key` is the
  // entry within it, `value` is the already client-side-encrypted blob. Returns
  // the previous value at that key, if any. Access is checked against the caller.
  public shared (msg) func insert_encrypted_value_custom(
    map_owner : Principal,
    map_name : ByteBuf,
    map_key : ByteBuf,
    value : ByteBuf,
  ) : async Result<?ByteBuf, Text> {
    let result = encryptedMaps.insertEncryptedValue(msg.caller, (map_owner, map_name.inner), map_key.inner, value.inner);
    switch (result) {
      case (#err(e)) { #Err(e) };
      case (#ok(null)) { #Ok(null) };
      case (#ok(?blob)) { #Ok(?{ inner = blob }) };
    };
  };

  // A canister-owned value read via `encryptedMaps`. `map_owner` + `map_name`
  // identify the map, `map_key` the entry; returns the encrypted value if any.
  public query (msg) func get_encrypted_value_custom(
    map_owner : Principal,
    map_name : ByteBuf,
    map_key : ByteBuf,
  ) : async Result<?ByteBuf, Text> {
    let result = encryptedMaps.getEncryptedValue(msg.caller, (map_owner, map_name.inner), map_key.inner);
    switch (result) {
      case (#err(e)) { #Err(e) };
      case (#ok(null)) { #Ok(null) };
      case (#ok(?blob)) { #Ok(?{ inner = blob }) };
    };
  };
};
