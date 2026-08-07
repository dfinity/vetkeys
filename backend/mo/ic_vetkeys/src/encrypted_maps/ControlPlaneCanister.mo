import EncryptedMaps "EncryptedMaps";
import Types "../Types";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Result "mo:core/Result";
import Array "mo:core/Array";

/// Mixin providing the EncryptedMaps **control plane** — the vetKD key,
/// access-control, and map-name-enumeration endpoints, plus the in-scope
/// `encryptedMaps` instance — but **none** of the endpoints that read or write
/// encrypted map *values*.
///
/// Use this for the "wrap-and-extend" pattern: a canister that stores something
/// *alongside* each value (e.g. a backend-authoritative metadata record per
/// entry) and must expose its own value read/write endpoints to keep the two
/// stores consistent in a single call. `include` this mixin to get the safe
/// control-plane passthroughs (guaranteed to match what the `@icp-sdk/vetkeys`
/// frontend expects), then write your own value endpoints against the in-scope
/// `encryptedMaps` object.
///
/// For a complete drop-in canister with all endpoints, use
/// [`EncryptedMapsCanister`](Canister) (`mo:ic-vetkeys/encrypted_maps/Canister`)
/// instead, which is this mixin plus the value endpoints.
///
/// The mixin holds no stable state of its own: the caller declares the
/// `EncryptedMapsState` in the actor body (so the state stays a plain, visible
/// stable variable the canister owns and can migrate) and passes it in. The
/// mixin only builds the `transient` `encryptedMaps` wrapper over it and adds the
/// endpoints. Declare the state in a `persistent actor` so it survives upgrades.
///
/// Where the vetKD key name comes from is the caller's choice — the reference
/// canisters read it from a `VETKD_KEY_NAME` canister environment variable so the
/// key is picked at deploy time (via canister settings) without an actor class.
///
/// Example (`Main.mo`) — wrap the value writes with your own side-state:
/// ```motoko
/// import EncryptedMapsControlPlaneCanister "mo:ic-vetkeys/encrypted_maps/ControlPlaneCanister";
/// import EncryptedMaps "mo:ic-vetkeys/encrypted_maps/EncryptedMaps";
/// import Types "mo:ic-vetkeys/Types";
/// import Runtime "mo:core/Runtime";
///
/// persistent actor {
///     // The canister owns its stable state. `keyName` is `transient` because it
///     // is only an install-time input, baked into `encryptedMapsState` below.
///     transient let keyName = Runtime.envVar<system>("VETKD_KEY_NAME") ?? "test_key_1";
///     let encryptedMapsState = EncryptedMaps.newEncryptedMapsState<Types.AccessRights>(
///         { curve = #bls12_381_g2; name = keyName },
///         "my_app_domain_separator",
///     );
///     include EncryptedMapsControlPlaneCanister(encryptedMapsState);
///
///     // `encryptedMaps`, `ByteBuf`, and `Result` are in scope from the mixin.
///     public shared (msg) func insert_encrypted_value_with_metadata(
///         map_owner : Principal, map_name : ByteBuf, map_key : ByteBuf, value : ByteBuf,
///         /* ...app fields... */
///     ) : async Result<?ByteBuf, Text> {
///         let result = encryptedMaps.insertEncryptedValue(msg.caller, (map_owner, map_name.inner), map_key.inner, value.inner);
///         // ...maintain the linked side-state in the same call...
///         switch (result) { case (#err(e)) { #Err(e) }; case (#ok(null)) { #Ok(null) }; case (#ok(?b)) { #Ok(?{ inner = b }) } };
///     };
/// };
/// ```
///
/// Only the value **writes** (`insert_encrypted_value`, `remove_encrypted_value`,
/// `remove_map_values`) can break such a linked invariant; the value **reads**
/// are omitted too, for API-surface hygiene (you rarely want a metadata-less
/// value view beside your wrapped one).
///
/// The `domainSeparator` passed to `newEncryptedMapsState` isolates the derived
/// keys of this application from other vetKeys deployments and must stay stable
/// for the life of the canister.
///
/// The vetKD **key name is likewise immutable for the life of the canister's
/// data**: it feeds vetKD key derivation, so changing it after any value has
/// been encrypted makes every stored value undecryptable. Resolve it once at
/// install and never change it under a running canister. Because the key lives
/// in the stable state, changing `VETKD_KEY_NAME` on a later upgrade is silently
/// ignored (the setting and the key in use can diverge); only a `reinstall`
/// (which drops all state) can switch keys. Keeping init total (the
/// `?? "test_key_1"` default rather than trapping on a missing env var) also
/// means a misconfigured deploy can never leave the canister half-initialized.
mixin (encryptedMapsState : EncryptedMaps.EncryptedMapsState<Types.AccessRights>) {
    transient let encryptedMaps = EncryptedMaps.EncryptedMaps(encryptedMapsState, Types.accessRightsOperations());

    /// In this canister, we use the `ByteBuf` type to represent blobs. The reason is that we want to be consistent with the Rust canister implementation.
    /// Unfortunately, the `Blob` type cannot be serialized/deserialized in the current Rust implementation efficiently without nesting it in another type.
    public type ByteBuf = { inner : Blob };

    /// The result type compatible with Rust's `Result`.
    public type Result<Ok, Err> = {
        #Ok : Ok;
        #Err : Err;
    };

    public query (msg) func get_accessible_shared_map_names() : async [(Principal, ByteBuf)] {
        Array.map<(Principal, Blob), (Principal, ByteBuf)>(
            encryptedMaps.getAccessibleSharedMapNames(msg.caller),
            func((principal, blob) : (Principal, Blob)) {
                (principal, { inner = blob });
            },
        );
    };

    public query (msg) func get_shared_user_access_for_map(
        map_owner : Principal,
        map_name : ByteBuf,
    ) : async Result<[(Principal, Types.AccessRights)], Text> {
        convertResult(encryptedMaps.getSharedUserAccessForMap(msg.caller, (map_owner, map_name.inner)));
    };

    public query (msg) func get_owned_non_empty_map_names() : async [ByteBuf] {
        Array.map<Blob, ByteBuf>(
            encryptedMaps.getOwnedNonEmptyMapNames(msg.caller),
            func(blob : Blob) : ByteBuf {
                { inner = blob };
            },
        );
    };

    public shared func get_vetkey_verification_key() : async ByteBuf {
        let inner = await encryptedMaps.getVetkeyVerificationKey();
        { inner };
    };

    public shared (msg) func get_encrypted_vetkey(
        map_owner : Principal,
        map_name : ByteBuf,
        transport_key : ByteBuf,
    ) : async Result<ByteBuf, Text> {
        let result = await encryptedMaps.getEncryptedVetkey(msg.caller, (map_owner, map_name.inner), transport_key.inner);
        switch (result) {
            case (#err(e)) { #Err(e) };
            case (#ok(vetkey)) { #Ok({ inner = vetkey }) };
        };
    };

    public query (msg) func get_user_rights(
        map_owner : Principal,
        map_name : ByteBuf,
        user : Principal,
    ) : async Result<?Types.AccessRights, Text> {
        convertResult(encryptedMaps.getUserRights(msg.caller, (map_owner, map_name.inner), user));
    };

    public shared (msg) func set_user_rights(
        map_owner : Principal,
        map_name : ByteBuf,
        user : Principal,
        access_rights : Types.AccessRights,
    ) : async Result<?Types.AccessRights, Text> {
        convertResult(encryptedMaps.setUserRights(msg.caller, (map_owner, map_name.inner), user, access_rights));
    };

    public shared (msg) func remove_user(
        map_owner : Principal,
        map_name : ByteBuf,
        user : Principal,
    ) : async Result<?Types.AccessRights, Text> {
        convertResult(encryptedMaps.removeUser(msg.caller, (map_owner, map_name.inner), user));
    };

    /// Convert to the result type compatible with Rust's `Result`
    private func convertResult<Ok, Err>(result : Result.Result<Ok, Err>) : Result<Ok, Err> {
        switch (result) {
            case (#err(e)) { #Err(e) };
            case (#ok(o)) { #Ok(o) };
        };
    };
};
