import ControlPlaneCanister "ControlPlaneCanister";
import EncryptedMaps "EncryptedMaps";
import Types "../Types";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Array "mo:core/Array";

/// Mixin that turns an actor into a complete EncryptedMaps canister.
///
/// `include` this into a `persistent actor` to get every shared/query endpoint,
/// so an adopter's `Main.mo` is a few lines instead of ~200 lines of hand-written
/// delegation. Because the mixin is the single source of the endpoint set, the
/// exposed Candid interface is exactly the one the `@icp-sdk/vetkeys` frontend
/// expects, by construction.
///
/// This is the control-plane mixin
/// [`EncryptedMapsControlPlaneCanister`](ControlPlaneCanister) plus the value
/// read/write endpoints. If your canister keeps state linked to each value and
/// must own the value endpoints, include the control-plane mixin instead and
/// provide your own value endpoints.
///
/// The mixin holds no stable state of its own: the caller declares the
/// `EncryptedMapsState` in the actor body (so it stays a plain, visible stable
/// variable the canister owns and can migrate) and passes it in. Declare it in a
/// `persistent actor` so it survives upgrades. Where the vetKD key name comes
/// from is the caller's choice — the reference canisters read it from a
/// `VETKD_KEY_NAME` canister environment variable so it is picked at deploy time
/// without an actor class.
///
/// Example (`Main.mo`):
/// ```motoko
/// import EncryptedMapsCanister "mo:ic-vetkeys/encrypted_maps/Canister";
/// import EncryptedMaps "mo:ic-vetkeys/encrypted_maps/EncryptedMaps";
/// import Types "mo:ic-vetkeys/Types";
/// import Runtime "mo:core/Runtime";
///
/// persistent actor {
///     // `transient` because the key name is only an install-time input: it is
///     // baked into `encryptedMapsState` below and never read again.
///     transient let keyName = Runtime.envVar<system>("VETKD_KEY_NAME") ?? "test_key_1";
///     let encryptedMapsState = EncryptedMaps.newEncryptedMapsState<Types.AccessRights>(
///         { curve = #bls12_381_g2; name = keyName },
///         "my_app_domain_separator",
///     );
///     include EncryptedMapsCanister(encryptedMapsState);
/// };
/// ```
///
/// The `domainSeparator` passed to `newEncryptedMapsState` isolates the derived
/// keys of this application from other vetKeys deployments and must stay stable
/// for the life of the canister.
///
/// The vetKD **key name is likewise immutable for the life of the canister's
/// data**: it feeds vetKD key derivation, so changing it after any value has
/// been encrypted makes every stored value undecryptable. Resolve it once at
/// install (as above) and never change it under a running canister. Because the
/// key lives in the stable state, changing `VETKD_KEY_NAME` on a later upgrade
/// is silently ignored — the canister keeps the key from install, so the setting
/// and the key in use can diverge; only a `reinstall`, which drops all state,
/// changes the key. Keeping init total (the `?? "test_key_1"` default, rather
/// than trapping on a missing env var) also means a misconfigured deploy can
/// never leave the canister half-initialized. If a wrong key on mainnet would be
/// worse than a failed deploy, assert the expected key instead of defaulting.
mixin (encryptedMapsState : EncryptedMaps.EncryptedMapsState<Types.AccessRights>) {
    // The control plane builds the `encryptedMaps` instance over the caller's
    // state and provides the `ByteBuf`/`Result` types and the
    // vetKD/access-control/enumeration endpoints. This mixin adds the value
    // read/write endpoints on top.
    include ControlPlaneCanister(encryptedMapsState);

    public type EncryptedMapData = {
        map_owner : Principal;
        map_name : ByteBuf;
        keyvals : [(ByteBuf, ByteBuf)];
        access_control : [(Principal, Types.AccessRights)];
    };

    public query (msg) func get_encrypted_values_for_map(
        map_owner : Principal,
        map_name : ByteBuf,
    ) : async Result<[(ByteBuf, ByteBuf)], Text> {
        let result = encryptedMaps.getEncryptedValuesForMap(msg.caller, (map_owner, map_name.inner));
        switch (result) {
            case (#err(e)) { #Err(e) };
            case (#ok(values)) {
                #Ok(
                    Array.map<(Blob, Blob), (ByteBuf, ByteBuf)>(
                        values,
                        func((blob1, blob2) : (Blob, Blob)) {
                            ({ inner = blob1 }, { inner = blob2 });
                        },
                    )
                );
            };
        };
    };

    public query (msg) func get_all_accessible_encrypted_values() : async [((Principal, ByteBuf), [(ByteBuf, ByteBuf)])] {
        Array.map<((Principal, Blob), [(Blob, Blob)]), ((Principal, ByteBuf), [(ByteBuf, ByteBuf)])>(
            encryptedMaps.getAllAccessibleEncryptedValues(msg.caller),
            func(((owner, map_name), values) : ((Principal, Blob), [(Blob, Blob)])) {
                (
                    (owner, { inner = map_name }),
                    Array.map<(Blob, Blob), (ByteBuf, ByteBuf)>(
                        values,
                        func((blob1, blob2) : (Blob, Blob)) {
                            ({ inner = blob1 }, { inner = blob2 });
                        },
                    ),
                );
            },
        );
    };

    public query (msg) func get_all_accessible_encrypted_maps() : async [EncryptedMapData] {
        Array.map<EncryptedMaps.EncryptedMapData<Types.AccessRights>, EncryptedMapData>(
            encryptedMaps.getAllAccessibleEncryptedMaps(msg.caller),
            func(map : EncryptedMaps.EncryptedMapData<Types.AccessRights>) : EncryptedMapData {
                {
                    map_owner = map.map_owner;
                    map_name = { inner = map.map_name };
                    keyvals = Array.map<(Blob, Blob), (ByteBuf, ByteBuf)>(
                        map.keyvals,
                        func((blob1, blob2) : (Blob, Blob)) {
                            ({ inner = blob1 }, { inner = blob2 });
                        },
                    );
                    access_control = map.access_control;
                };
            },
        );
    };

    public query (msg) func get_encrypted_value(
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

    public shared (msg) func remove_map_values(
        map_owner : Principal,
        map_name : ByteBuf,
    ) : async Result<[ByteBuf], Text> {
        let result = encryptedMaps.removeMapValues(msg.caller, (map_owner, map_name.inner));
        switch (result) {
            case (#err(e)) { #Err(e) };
            case (#ok(values)) {
                #Ok(
                    Array.map<Blob, ByteBuf>(
                        values,
                        func(blob : Blob) : ByteBuf {
                            { inner = blob };
                        },
                    )
                );
            };
        };
    };

    public shared (msg) func insert_encrypted_value(
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

    public shared (msg) func remove_encrypted_value(
        map_owner : Principal,
        map_name : ByteBuf,
        map_key : ByteBuf,
    ) : async Result<?ByteBuf, Text> {
        let result = encryptedMaps.removeEncryptedValue(msg.caller, (map_owner, map_name.inner), map_key.inner);
        switch (result) {
            case (#err(e)) { #Err(e) };
            case (#ok(null)) { #Ok(null) };
            case (#ok(?blob)) { #Ok(?{ inner = blob }) };
        };
    };
};
