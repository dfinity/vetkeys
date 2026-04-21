/// The **EncryptedMaps** backend is a support library built on top of `KeyManager`.
///
/// **EncryptedMaps** is designed to facilitate secure, encrypted data sharing between users on the Internet Computer (ICP) using the **vetKeys** feature. It allows developers to store encrypted key-value pairs (**maps**) securely and to manage fine-grained user access.
///
/// For an introduction to **vetKeys**, refer to the [vetKeys Overview](https://internetcomputer.org/docs/building-apps/network-features/vetkeys/introduction).
///
/// ## Core Features
///
/// The **EncryptedMaps** library provides the following key functionalities:
///
/// - **Encrypted Key-Value Storage:** Securely store and manage encrypted key-value pairs within named maps.
/// - **User-Specific Map Access:** Control precisely which users can read or modify entries in an encrypted map.
/// - **Integrated Access Control:** Leverages the **KeyManager** library to manage and enforce user permissions.
/// - **Stable Storage:** Utilizes **Map** for reliable, persistent storage across canister upgrades.
///
/// ## EncryptedMaps Architecture
///
/// The **EncryptedMaps** library contains:
///
/// - **Encrypted Values Storage:** Maps `(KeyId, MapKey)` to `EncryptedMapValue`, securely storing encrypted data.
/// - **KeyManager Integration:** Uses **KeyManager** to handle user permissions, ensuring authorized access to maps.
///
/// ## Example Use Case
///
/// 1. **User A** initializes an encrypted map and adds values.
/// 2. **User A** shares access to this map with **User B**.
/// 3. **User B** retrieves encrypted values securely.
/// 4. **User A** revokes **User B**'s access as necessary.
///
/// ## Security Considerations
///
/// - Encrypted values are stored securely with fine-grained access control.
/// - Access rights and permissions are strictly enforced.
/// - Data persists securely across canister upgrades through stable storage.
///
/// ## Summary
/// **EncryptedMaps** simplifies secure storage, retrieval, and controlled sharing of encrypted data on the Internet Computer, complementing the robust security and permissions management provided by **KeyManager**.

import Principal "mo:core/Principal";
import Blob "mo:core/Blob";
import List "mo:core/List";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Option "mo:core/Option";
import Runtime "mo:core/Runtime";
import Map "mo:core/pure/Map";
import Result "mo:core/Result";
import Types "../Types";
import Text "mo:core/Text";
import KeyManager "../key_manager/KeyManager";
import ManagementCanister "../ManagementCanister";

module {
    /// The caller requesting access to encrypted maps, represented as a Principal.
    public type Caller = Principal;

    /// The name of an encrypted map, used as part of the map identifier.
    public type MapName = KeyManager.KeyName;

    /// A unique identifier for an encrypted map, consisting of the owner and map name.
    public type MapId = KeyManager.KeyId;

    /// A key within an encrypted map, used to identify specific values.
    public type MapKey = Blob;

    /// An encrypted value stored within an encrypted map.
    public type EncryptedMapValue = Blob;

    /// Represents the complete data for an encrypted map, including ownership, contents, and access control.
    public type EncryptedMapData<T> = {
        map_owner : Principal;
        map_name : MapName;
        keyvals : [(MapKey, EncryptedMapValue)];
        access_control : [(Principal, T)];
    };

    func compareMapIds(a : MapId, b : MapId) : { #less; #greater; #equal } {
        KeyManager.compareKeyIds(a, b);
    };

    func compareMapKeyValKeys(a : (MapId, MapKey), b : (MapId, MapKey)) : {
        #less;
        #greater;
        #equal;
    } {
        let mapIdCompare = compareMapIds(a.0, b.0);
        if (mapIdCompare == #equal) {
            Blob.compare(a.1, b.1);
        } else {
            mapIdCompare;
        };
    };

    public type EncryptedMapsState<T> = {
        var keyManager : KeyManager.KeyManagerState<T>;
        var mapKeyVals : Map.Map<(MapId, MapKey), EncryptedMapValue>;
        var mapKeys : Map.Map<MapId, [MapKey]>;
    };

    public func newEncryptedMapsState<T>(vetKdKeyId : ManagementCanister.VetKdKeyid, domainSeparator : Text) : EncryptedMapsState<T> {
        {
            var keyManager = KeyManager.newKeyManagerState<T>(vetKdKeyId, domainSeparator);
            var mapKeyVals = Map.empty<(MapId, MapKey), EncryptedMapValue>();
            var mapKeys = Map.empty<MapId, [MapKey]>();
        };
    };

    /// See the module documentation for more information.
    public class EncryptedMaps<T>(encryptedMapsState : EncryptedMapsState<T>, accessRightsOperations : Types.AccessControlOperations<T>) {
        let keyManager = KeyManager.KeyManager(encryptedMapsState.keyManager, accessRightsOperations);

        /// Lists all map names shared with the caller.
        /// Returns a vector of map IDs that the caller has access to.
        public func getAccessibleSharedMapNames(caller : Caller) : [MapId] {
            keyManager.getAccessibleSharedKeyIds(caller);
        };

        /// Retrieves all users and their access rights for a specific map.
        /// The caller must have appropriate permissions to view this information.
        public func getSharedUserAccessForMap(caller : Caller, mapId : MapId) : Result.Result<[(Caller, T)], Text> {
            keyManager.getSharedUserAccessForKey(caller, mapId);
        };

        /// Removes all values from a map if the caller has sufficient rights.
        /// Returns the removed keys.
        /// The caller must have write permissions to perform this operation.
        public func removeMapValues(caller : Caller, mapId : MapId) : Result.Result<[MapKey], Text> {
            switch (keyManager.ensureUserCanWrite(caller, mapId)) {
                case (#err(msg)) { #err(msg) };
                case (#ok(_)) {
                    let keys = switch (encryptedMapsState.mapKeys.get(compareMapIds, mapId)) {
                        case (null) { [] };
                        case (?ks) { ks };
                    };
                    for (key in keys.values()) {
                        encryptedMapsState.mapKeyVals := encryptedMapsState.mapKeyVals.remove(compareMapKeyValKeys, (mapId, key));
                    };
                    encryptedMapsState.mapKeys := encryptedMapsState.mapKeys.remove(compareMapIds, mapId);
                    #ok(keys);
                };
            };
        };

        /// Retrieves all encrypted key-value pairs from a map.
        /// The caller must have read permissions to access the map values.
        public func getEncryptedValuesForMap(caller : Caller, mapId : MapId) : Result.Result<[(MapKey, EncryptedMapValue)], Text> {
            switch (keyManager.ensureUserCanRead(caller, mapId)) {
                case (#err(msg)) { #err(msg) };
                case (#ok(_)) {
                    let values = List.empty<(MapKey, EncryptedMapValue)>();
                    let keys = switch (encryptedMapsState.mapKeys.get(compareMapIds, mapId)) {
                        case (null) { [] };
                        case (?ks) { ks };
                    };
                    for (key in keys.values()) {
                        switch (encryptedMapsState.mapKeyVals.get(compareMapKeyValKeys, (mapId, key))) {
                            case (null) {};
                            case (?value) {
                                values.add((key, value));
                            };
                        };
                    };
                    #ok(values.toArray());
                };
            };
        };

        /// Retrieves a specific encrypted value from a map.
        /// The caller must have read permissions to access the value.
        public func getEncryptedValue(caller : Caller, mapId : MapId, key : MapKey) : Result.Result<?EncryptedMapValue, Text> {
            switch (keyManager.ensureUserCanRead(caller, mapId)) {
                case (#err(msg)) { #err(msg) };
                case (#ok(_)) {
                    #ok(encryptedMapsState.mapKeyVals.get(compareMapKeyValKeys, (mapId, key)));
                };
            };
        };

        /// Retrieves the non-empty map names owned by the caller.
        public func getAllAccessibleEncryptedValues(caller : Caller) : [(MapId, [(MapKey, EncryptedMapValue)])] {
            let result = List.empty<(MapId, [(MapKey, EncryptedMapValue)])>();
            for (mapId in getAccessibleMapIdsIter(caller)) {
                switch (getEncryptedValuesForMap(caller, mapId)) {
                    case (#err(_)) {
                        Runtime.trap("bug: failed to get encrypted values");
                    };
                    case (#ok(mapValues)) {
                        result.add((mapId, mapValues));
                    };
                };
            };
            result.toArray();
        };

        /// Retrieves all accessible encrypted maps and their data for the caller.
        public func getAllAccessibleEncryptedMaps(caller : Caller) : [EncryptedMapData<T>] {
            let result = List.empty<EncryptedMapData<T>>();
            for (mapId in getAccessibleMapIdsIter(caller)) {
                let keyvals = switch (getEncryptedValuesForMap(caller, mapId)) {
                    case (#err(_)) {
                        Runtime.trap("bug: failed to get encrypted values");
                    };
                    case (#ok(mapValues)) {
                        mapValues.map(
                            func((key, value)) = (key, value)
                        );
                    };
                };
                let map = {
                    map_owner = mapId.0;
                    map_name = mapId.1;
                    keyvals = keyvals;
                    access_control = switch (getSharedUserAccessForMap(caller, mapId)) {
                        case (#err(_)) { [] };
                        case (#ok(access)) { access };
                    };
                };
                result.add(map);
            };
            result.toArray();
        };

        /// Retrieves the non-empty map names owned by the caller.
        /// Returns a list of map names that contain at least one key-value pair.
        public func getOwnedNonEmptyMapNames(caller : Caller) : [MapName] {
            let mapNames = List.empty<MapName>();
            for ((mapId, _) in encryptedMapsState.mapKeys.entries()) {
                if (Principal.equal(mapId.0, caller)) {
                    mapNames.add(mapId.1);
                };
            };
            mapNames.toArray();
        };

        /// Inserts or updates an encrypted value in a map.
        /// The caller must have write permissions to modify the map.
        public func insertEncryptedValue(
            caller : Caller,
            mapId : MapId,
            key : MapKey,
            encryptedValue : EncryptedMapValue,
        ) : Result.Result<?EncryptedMapValue, Text> {
            switch (keyManager.ensureUserCanWrite(caller, mapId)) {
                case (#err(msg)) { #err(msg) };
                case (#ok(_)) {
                    let oldValue = encryptedMapsState.mapKeyVals.get(compareMapKeyValKeys, (mapId, key));
                    encryptedMapsState.mapKeyVals := encryptedMapsState.mapKeyVals.add(compareMapKeyValKeys, (mapId, key), encryptedValue);

                    // Update mapKeys
                    let currentKeys = switch (encryptedMapsState.mapKeys.get(compareMapIds, mapId)) {
                        case (null) { [] };
                        case (?ks) { ks };
                    };
                    if (currentKeys.find(func(k : MapKey) : Bool = Blob.equal(k, key)).isNull()) {
                        encryptedMapsState.mapKeys := encryptedMapsState.mapKeys.add(compareMapIds, mapId, currentKeys.concat([key]));
                    };

                    #ok(oldValue);
                };
            };
        };

        /// Removes an encrypted value from a map.
        /// The caller must have write permissions to modify the map.
        public func removeEncryptedValue(
            caller : Caller,
            mapId : MapId,
            key : MapKey,
        ) : Result.Result<?EncryptedMapValue, Text> {
            switch (keyManager.ensureUserCanWrite(caller, mapId)) {
                case (#err(msg)) { #err(msg) };
                case (#ok(_)) {
                    let oldValue = encryptedMapsState.mapKeyVals.get(compareMapKeyValKeys, (mapId, key));
                    encryptedMapsState.mapKeyVals := encryptedMapsState.mapKeyVals.remove(compareMapKeyValKeys, (mapId, key));

                    // Update mapKeys
                    let currentKeys = switch (encryptedMapsState.mapKeys.get(compareMapIds, mapId)) {
                        case (null) { [] };
                        case (?ks) { ks };
                    };
                    let newKeys = currentKeys.filter(func(k : MapKey) : Bool = not Blob.equal(k, key));
                    if (newKeys.size() == 0) {
                        encryptedMapsState.mapKeys := encryptedMapsState.mapKeys.remove(compareMapIds, mapId);
                    } else {
                        encryptedMapsState.mapKeys := encryptedMapsState.mapKeys.add(compareMapIds, mapId, newKeys);
                    };

                    #ok(oldValue);
                };
            };
        };

        /// Retrieves the public verification key from KeyManager.
        /// This key is used to verify the authenticity of derived keys.
        public func getVetkeyVerificationKey() : async KeyManager.VetKeyVerificationKey {
            await keyManager.getVetkeyVerificationKey();
        };

        /// Retrieves an encrypted vetkey for caller and key id.
        /// The key is secured using the provided transport key and can only be accessed by authorized users.
        public func getEncryptedVetkey(
            caller : Caller,
            mapId : MapId,
            transportKey : KeyManager.TransportKey,
        ) : async Result.Result<KeyManager.VetKey, Text> {
            await keyManager.getEncryptedVetkey(caller, mapId, transportKey);
        };

        /// Retrieves access rights for a user to a map.
        /// The caller must have appropriate permissions to view this information.
        public func getUserRights(caller : Caller, mapId : MapId, user : Principal) : Result.Result<?T, Text> {
            keyManager.getUserRights(caller, mapId, user);
        };

        /// Sets or updates access rights for a user to a map.
        /// Only the map owner or a user with management rights can perform this action.
        public func setUserRights(
            caller : Caller,
            mapId : MapId,
            user : Principal,
            accessRights : T,
        ) : Result.Result<?T, Text> {
            keyManager.setUserRights(caller, mapId, user, accessRights);
        };

        /// Removes access rights for a user from a map.
        /// Only the map owner or a user with management rights can perform this action.
        public func removeUser(caller : Caller, mapId : MapId, user : Principal) : Result.Result<?T, Text> {
            keyManager.removeUserRights(caller, mapId, user);
        };

        // Private helper functions
        func getAccessibleMapIdsIter(caller : Caller) : Iter.Iter<MapId> {
            let accessibleMapIds = Iter.fromArray(getAccessibleSharedMapNames(caller));
            let ownedMapIds = Iter.fromArray(getOwnedNonEmptyMapNames(caller)).map(
                func(mapName) = (caller, mapName)
            );
            return accessibleMapIds.concat(ownedMapIds);
        };
    };
};
