// Reference canister for the `EncryptedMapsControlPlaneCanister` mixin (the
// "wrap-and-extend" form). It includes the control-plane mixin — the state, the
// vetKD/access-control/enumeration endpoints, and the in-scope `encryptedMaps`
// object — but NOT the value read/write endpoints; the canister exposes its own.
// This is the pattern a dapp uses when it keeps state linked to each value (e.g.
// a metadata row per entry) and must own the value endpoints to keep that state
// consistent.
//
// This minimal example just re-implements a plain insert/get against
// `encryptedMaps` to exercise the surface; a full linked-metadata example lives
// in `password_manager_with_metadata` in dfinity/examples.
import EncryptedMapsControlPlaneCanister "mo:ic-vetkeys/encrypted_maps/ControlPlaneCanister";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

persistent actor {
  // Brings the state, control-plane endpoints, and the `encryptedMaps`,
  // `ByteBuf`, and `Result` names into scope. The vetKD key name comes from the
  // `VETKD_KEY_NAME` canister environment variable, so no actor class is needed.
  include EncryptedMapsControlPlaneCanister<system>("encrypted_maps_custom_dapp");

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
