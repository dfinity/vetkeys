/// The **KeyManager** backend is a support library for **vetKeys**.
///
/// **vetKeys** is a feature of the Internet Computer (ICP) that enables the derivation of **encrypted cryptographic keys**. This library simplifies the process of key retrieval, encryption, and controlled sharing, ensuring secure and efficient key management for canisters and users.
///
/// For an introduction to **vetKeys**, refer to the [vetKeys Overview](https://internetcomputer.org/docs/building-apps/network-features/vetkeys/introduction).
///
/// ## Core Features
///
/// The **KeyManager** support library provides the following core functionalities:
///
/// - **Request an Encrypted Key:** Users can derive any number of **encrypted cryptographic keys**, secured using a user-provided **public transport key**. Each vetKey is associated with a unique **key id**.
/// - **Manage vetKey Sharing:** A user can **share their vetKeys** with other users while controlling access rights.
/// - **Access Control Management:** Users can define and enforce **fine-grained permissions** (read, write, manage) for each vetKey.
/// - **Uses Stable Storage:** The library persists key access information using **Map**, ensuring reliability across canister upgrades.
///
/// ## KeyManager Architecture
///
/// The **KeyManager** consists of two primary components:
///
/// 1. **Access Control Map** (`accessControl`): Maps `(Caller, KeyId)` to `T`, defining permissions for each user.
/// 2. **Shared Keys Map** (`sharedKeys`): Tracks which users have access to shared vetKeys.
///
/// ## Example Use Case
///
/// 1. **User A** requests a vetKey from KeyManager.
/// 2. KeyManager verifies permissions and derives an **encrypted cryptographic key**.
/// 3. **User A** securely shares access with **User B** using `setUserRights`.
/// 4. **User B** retrieves the key securely via `getEncryptedVetkey`.
///
/// ## Security Considerations
///
/// - vetKeys are derived **on demand** and constructed from encrypted vetKey shares.
/// - Only authorized users can access shared vetKeys.
/// - Stable storage ensures vetKeys persist across canister upgrades.
/// - Access control logic ensures only authorized users retrieve vetKeys or modify access rights.
///
/// ## Summary
/// `KeyManager` simplifies the usage of **vetKeys** on the ICP, providing a secure and efficient mechanism for **cryptographic key derivation, sharing, and management**.

import Principal "mo:core/Principal";
import Blob "mo:core/Blob";
import List "mo:core/List";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Map "mo:core/pure/Map";
import Result "mo:core/Result";
import Types "../Types";
import Text "mo:core/Text";
import Nat8 "mo:core/Nat8";
import ManagementCanister "../ManagementCanister";

module {
    /// The public verification key used to verify the authenticity of derived vetKeys.
    public type VetKeyVerificationKey = Blob;

    /// An encrypted cryptographic key derived using vetKD.
    public type VetKey = Blob;

    /// The owner of a vetKey, represented as a Principal.
    public type Owner = Principal;

    /// The caller requesting access to a vetKey, represented as a Principal.
    public type Caller = Principal;

    /// The name of a vetKey, used as part of the key identifier.
    public type KeyName = Blob;

    /// A unique identifier for a vetKey, consisting of the owner and key name.
    public type KeyId = (Owner, KeyName);

    /// The public transport key used to encrypt vetKeys for secure transmission.
    public type TransportKey = Blob;

    public func compareKeyIds(a : KeyId, b : KeyId) : { #less; #greater; #equal } {
        let ownersCompare = Principal.compare(a.0, b.0);
        if (ownersCompare == #equal) {
            Blob.compare(a.1, b.1);
        } else {
            ownersCompare;
        };
    };

    public type KeyManagerState<T> = {
        var accessControl : Map.Map<Principal, [(KeyId, T)]>;
        var sharedKeys : Map.Map<KeyId, [Principal]>;
        var vetKdKeyId : ManagementCanister.VetKdKeyid;
        domainSeparator : Text;
    };

    public func newKeyManagerState<T>(vetKdKeyId : ManagementCanister.VetKdKeyid, domainSeparator : Text) : KeyManagerState<T> {
        {
            var accessControl = Map.empty<Principal, [(KeyId, T)]>();
            var sharedKeys = Map.empty<KeyId, [Principal]>();
            var vetKdKeyId = vetKdKeyId;
            domainSeparator;
        };
    };

    /// See the module documentation for more information.
    public class KeyManager<T>(keyManagerState : KeyManagerState<T>, accessRightsOperations : Types.AccessControlOperations<T>) {
        let domainSeparatorBytes = keyManagerState.domainSeparator.encodeUtf8();

        /// Retrieves all vetKey IDs shared with the given caller.
        /// This method returns a list of all vetKeys that the caller has access to.
        public func getAccessibleSharedKeyIds(caller : Caller) : [KeyId] {
            switch (keyManagerState.accessControl.get(caller)) {
                case (null) { [] };
                case (?entries) {
                    entries.map<(KeyId, T), KeyId>(func((keyId, _)) = keyId);
                };
            };
        };

        /// Retrieves a list of users with whom a given vetKey has been shared, along with their access rights.
        /// The caller must have appropriate permissions to view this information.
        public func getSharedUserAccessForKey(caller : Caller, keyId : KeyId) : Result.Result<[(Caller, T)], Text> {
            let canRead = ensureUserCanRead(caller, keyId);
            switch (canRead) {
                case (#err(msg)) { return #err(msg) };
                case (_) {};
            };

            let users = switch (keyManagerState.sharedKeys.get(compareKeyIds, keyId)) {
                case (null) { return #ok([]) };
                case (?users) users;
            };

            let results = List.empty<(Caller, T)>();
            for (user in users.values()) {
                switch (getUserRights(caller, keyId, user)) {
                    case (#err(msg)) { return #err(msg) };
                    case (#ok(optRights)) {
                        switch (optRights) {
                            case (null) {
                                Runtime.trap("bug: missing access rights");
                            };
                            case (?rights) {
                                results.add((user, rights));
                            };
                        };
                    };
                };
            };
            #ok(results.toArray());
        };

        /// Retrieves the vetKD verification key for this canister.
        /// This key is used to verify the authenticity of derived vetKeys.
        public func getVetkeyVerificationKey() : async VetKeyVerificationKey {
            await ManagementCanister.vetKdPublicKey(null, domainSeparatorBytes, keyManagerState.vetKdKeyId);
        };

        /// Retrieves an encrypted vetKey for caller and key id.
        /// The vetKey is secured using the provided transport key and can only be accessed by authorized users.
        /// Returns an error if the caller is not authorized to access the vetKey.
        public func getEncryptedVetkey(caller : Caller, keyId : KeyId, transportKey : TransportKey) : async Result.Result<VetKey, Text> {
            switch (ensureUserCanRead(caller, keyId)) {
                case (#err(msg)) { #err(msg) };
                case (#ok(_)) {
                    let principalBytes = keyId.0.toBlob().toArray();
                    let input = [
                        [Nat8.fromNat(principalBytes.size())],
                        principalBytes,
                        keyId.1.toArray(),
                    ].flatten();

                    #ok(await ManagementCanister.vetKdDeriveKey(Blob.fromArray(input), domainSeparatorBytes, keyManagerState.vetKdKeyId, transportKey));
                };
            };
        };

        /// Retrieves the access rights a given user has to a specific vetKey.
        /// The caller must have appropriate permissions to view this information.
        public func getUserRights(caller : Caller, keyId : KeyId, user : Principal) : Result.Result<?T, Text> {
            switch (ensureUserCanGetUserRights(caller, keyId)) {
                case (#err(msg)) { #err(msg) };
                case (#ok(_)) {
                    #ok(
                        do ? {
                            if (Principal.equal(user, keyId.0)) {
                                accessRightsOperations.ownerRights();
                            } else {
                                let entries = keyManagerState.accessControl.get(user)!;
                                let (_k, foundRights) = entries.find(
                                    func((_k, _rights) : (KeyId, T)) : Bool = compareKeyIds(_k, keyId) == #equal,
                                )!;
                                foundRights;
                            };
                        }
                    );
                };
            };
        };

        /// Grants or modifies access rights for a user to a given vetKey.
        /// Only the vetKey owner or a user with management rights can perform this action.
        /// The vetKey owner cannot change their own rights.
        public func setUserRights(caller : Caller, keyId : KeyId, user : Principal, accessRights : T) : Result.Result<?T, Text> {
            switch (ensureUserCanSetUserRights(caller, keyId)) {
                case (#err(msg)) { #err(msg) };
                case (#ok(_)) {
                    if (Principal.equal(caller, keyId.0) and Principal.equal(caller, user)) {
                        return #err("cannot change key owner's user rights");
                    };

                    // Update sharedKeys
                    let currentUsers = switch (keyManagerState.sharedKeys.get(compareKeyIds, keyId)) {
                        case (null) { [] };
                        case (?users) { users };
                    };

                    let newUsers = switch (currentUsers.indexOf(user)) {
                        case (?_) currentUsers;
                        case (null) currentUsers.concat([user]);
                    };

                    keyManagerState.sharedKeys := keyManagerState.sharedKeys.add(compareKeyIds, keyId, newUsers);

                    // Update accessControl
                    let currentEntries = switch (keyManagerState.accessControl.get(user)) {
                        case (null) { [] };
                        case (?entries) { entries };
                    };

                    var oldRights : ?T = null;
                    let newEntries = switch (
                        currentEntries.indexOf(
                            func(a : (KeyId, T), b : (KeyId, T)) : Bool = compareKeyIds(a.0, b.0) == #equal,
                            (keyId, accessRightsOperations.ownerRights()),
                        )
                    ) {
                        case (?index) {
                            let mutCurrentEntries = currentEntries.toVarArray();
                            oldRights := ?mutCurrentEntries[index].1;
                            mutCurrentEntries[index] := (keyId, accessRights);
                            Array.fromVarArray(mutCurrentEntries);
                        };
                        case (null) {
                            currentEntries.concat([(keyId, accessRights)]);
                        };
                    };
                    keyManagerState.accessControl := keyManagerState.accessControl.add(user, newEntries);
                    #ok(oldRights);
                };
            };
        };

        /// Revokes a user's access to a shared vetKey.
        /// The vetKey owner cannot remove their own access.
        /// Only the vetKey owner or a user with management rights can perform this action.
        public func removeUserRights(caller : Caller, keyId : KeyId, user : Principal) : Result.Result<?T, Text> {
            switch (ensureUserCanSetUserRights(caller, keyId)) {
                case (#err(msg)) { #err(msg) };
                case (#ok(_)) {
                    if (Principal.equal(caller, user) and Principal.equal(caller, keyId.0)) {
                        return #err("cannot remove key owner");
                    };

                    // Update sharedKeys
                    let currentUsers = switch (keyManagerState.sharedKeys.get(compareKeyIds, keyId)) {
                        case (null) { [] };
                        case (?users) { users };
                    };
                    let newUsers = currentUsers.filter(func(u : Caller) : Bool = not Principal.equal(u, user));
                    keyManagerState.sharedKeys := keyManagerState.sharedKeys.add(compareKeyIds, keyId, newUsers);

                    // Update accessControl
                    let currentEntries = switch (keyManagerState.accessControl.get(user)) {
                        case (null) { [] };
                        case (?entries) { entries };
                    };
                    let (newEntries, oldRights) = currentEntries.foldRight<(KeyId, T), ([(KeyId, T)], ?T)>(
                        ([], null),
                        func((k, r), (entries, rights)) {
                            if (compareKeyIds(k, keyId) == #equal) {
                                (entries, ?r);
                            } else {
                                (entries.concat([(k, r)]), rights);
                            };
                        },
                    );
                    keyManagerState.accessControl := keyManagerState.accessControl.add(user, newEntries);
                    #ok(oldRights);
                };
            };
        };

        /// Ensures that a user has read access to a vetKey before proceeding.
        /// Returns an error if the user is not authorized.
        public func ensureUserCanRead(user : Principal, keyId : KeyId) : Result.Result<T, Text> {
            if (Principal.equal(user, keyId.0)) {
                return #ok(accessRightsOperations.ownerRights());
            };

            switch (keyManagerState.accessControl.get(user)) {
                case (null) { #err("unauthorized") };
                case (?entries) {
                    for ((k, rights) in entries.values()) {
                        if (compareKeyIds(k, keyId) == #equal) {
                            if (accessRightsOperations.canRead(rights)) {
                                return #ok(rights);
                            } else {
                                return #err("unauthorized");
                            };
                        };
                    };
                    #err("unauthorized");
                };
            };
        };

        /// Ensures that a user has write access to a vetKey before proceeding.
        /// Returns an error if the user is not authorized.
        public func ensureUserCanWrite(user : Principal, keyId : KeyId) : Result.Result<T, Text> {
            if (Principal.equal(user, keyId.0)) {
                return #ok(accessRightsOperations.ownerRights());
            };

            switch (keyManagerState.accessControl.get(user)) {
                case (null) { #err("unauthorized") };
                case (?entries) {
                    for ((k, rights) in entries.values()) {
                        if (compareKeyIds(k, keyId) == #equal) {
                            if (accessRightsOperations.canWrite(rights)) {
                                return #ok(rights);
                            } else {
                                return #err("unauthorized");
                            };
                        };
                    };
                    #err("unauthorized");
                };
            };
        };

        /// Ensures that a user has permission to view user rights for a vetKey.
        /// Returns an error if the user is not authorized.
        private func ensureUserCanGetUserRights(user : Principal, keyId : KeyId) : Result.Result<T, Text> {
            if (Principal.equal(user, keyId.0)) {
                return #ok(accessRightsOperations.ownerRights());
            };

            switch (keyManagerState.accessControl.get(user)) {
                case (null) { #err("unauthorized") };
                case (?entries) {
                    for ((k, rights) in entries.values()) {
                        if (compareKeyIds(k, keyId) == #equal) {
                            if (accessRightsOperations.canGetUserRights(rights)) {
                                return #ok(rights);
                            } else {
                                return #err("unauthorized");
                            };
                        };
                    };
                    #err("unauthorized");
                };
            };
        };

        /// Ensures that a user has management access to a vetKey before proceeding.
        /// Returns an error if the user is not authorized.
        private func ensureUserCanSetUserRights(user : Principal, keyId : KeyId) : Result.Result<T, Text> {
            if (Principal.equal(user, keyId.0)) {
                return #ok(accessRightsOperations.ownerRights());
            };

            switch (keyManagerState.accessControl.get(user)) {
                case (null) { #err("unauthorized") };
                case (?entries) {
                    for ((k, rights) in entries.values()) {
                        if (compareKeyIds(k, keyId) == #equal) {
                            if (accessRightsOperations.canSetUserRights(rights)) {
                                return #ok(rights);
                            } else {
                                return #err("unauthorized");
                            };
                        };
                    };
                    #err("unauthorized");
                };
            };
        };
    };
};
