import Principal "mo:base/Principal";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import Nat64 "mo:base/Nat64";
import Time "mo:base/Time";
import HashMap "mo:base/HashMap";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import Nat8 "mo:base/Nat8";
import Nat32 "mo:base/Nat32";
import Debug "mo:base/Debug";
import Nat "mo:base/Nat";
import VetKeys "mo:ic-vetkeys";
import Sha256 "mo:sha2/Sha256";

shared actor class (keyName : Text) = {
    // Types
    type Signature = {
        message : Text;
        signature : Blob;
        timestamp : Nat64;
    };

    type SignatureKey = {
        signer : Principal;
        timestamp : Nat64;
    };

    type VetKdKeyid = {
        curve : { #bls12_381_g2 };
        name : Text;
    };

    // Hash and equality functions for SignatureKey
    private func signatureKeyEqual(a : SignatureKey, b : SignatureKey) : Bool {
        Principal.equal(a.signer, b.signer) and a.timestamp == b.timestamp
    };

    private func signatureKeyHash(key : SignatureKey) : Nat32 {
        let signerBytes = Blob.toArray(Principal.toBlob(key.signer));
        let timestampBytes = nat64ToBytes(key.timestamp);
        let bytes = Array.append<Nat8>(signerBytes, timestampBytes);
        let hashBlob = Sha256.fromArray(#sha256, bytes);
        blobToNat32(hashBlob);
    };

    func nat64ToBytes(n : Nat64) : [Nat8] {
        let byteMask : Nat64 = 0xff;
        func byte(x : Nat64) : Nat8 {
            Nat8.fromNat(Nat64.toNat(x));
        };
        [
            byte(((byteMask << 56) & n) >> 56),
            byte(((byteMask << 48) & n) >> 48),
            byte(((byteMask << 40) & n) >> 40),
            byte(((byteMask << 32) & n) >> 32),
            byte(((byteMask << 24) & n) >> 24),
            byte(((byteMask << 16) & n) >> 16),
            byte(((byteMask << 8) & n) >> 8),
            byte(((byteMask << 0) & n) >> 0),
        ];
    };

    private func blobToNat32(blob : Blob) : Nat32 {
        let bytes = Blob.toArray(blob);
        (Nat32.fromNat(Nat8.toNat(bytes[0])) << 24) + (Nat32.fromNat(Nat8.toNat(bytes[1])) << 16) + (Nat32.fromNat(Nat8.toNat(bytes[2])) << 8) + Nat32.fromNat(Nat8.toNat(bytes[3]));
    };

    // Stable storage for signatures
    private var signatures : HashMap.HashMap<SignatureKey, Signature> = HashMap.HashMap(0, signatureKeyEqual, signatureKeyHash);

    // Helper function to get current timestamp
    private func getTimestamp() : Nat64 {
        Nat64.fromIntWrap(Time.now());
    };

    // Helper function to create context for vetKD
    private func context(signer : Principal) : Blob {
        // Domain separator for this dapp
        let domainSeparator : [Nat8] = Blob.toArray(Text.encodeUtf8("basic_bls_signing_dapp"));
        let domainSeparatorLength : [Nat8] = [Nat8.fromNat(domainSeparator.size())]; // Length of domain separator

        // Combine domain separator length, domain separator, and signer principal
        let signerBytes = Principal.toBlob(signer);
        let signerArray = Blob.toArray(signerBytes);

        let contextArray = Array.append<Nat8>(
            Array.append<Nat8>(domainSeparatorLength, domainSeparator),
            signerArray,
        );

        Blob.fromArray(contextArray);
    };

    // Helper function to get key ID
    private func keyId() : VetKdKeyid {
        {
            curve = #bls12_381_g2;
            name = keyName;
        };
    };

    // Sign a message using BLS
    public shared ({ caller }) func sign_message(message : Text) : async Blob {
        // TODO(CRP-2874): return only the signature bytes, not the entire vetKey bytes
        let bytes = await VetKeys.ManagementCanister.signWithBls(
            Text.encodeUtf8(message),
            context(caller),
            keyId(),
        );

        let BYTES_SIZE : Nat = 192;
        let SIGNATURE_SIZE : Nat = 48;

        if (bytes.size() != BYTES_SIZE) {
            Debug.trap("Expected " # Nat.toText(BYTES_SIZE) # " signature bytes, but got " # Nat.toText(bytes.size()));
        };

        let signatureBytes = Blob.fromArray(Array.subArray<Nat8>(Blob.toArray(bytes), BYTES_SIZE - SIGNATURE_SIZE, SIGNATURE_SIZE));

        let timestamp = getTimestamp();
        let signature : Signature = {
            message = message;
            signature = signatureBytes;
            timestamp = timestamp;
        };

        // Handle potential timestamp collisions by incrementing until we find a free slot
        var timestampForMapKey = timestamp;
        while (signatures.get({ signer = caller; timestamp = timestampForMapKey }) != null) {
            timestampForMapKey += 1;
        };

        signatures.put({ signer = caller; timestamp = timestampForMapKey }, signature);

        signatureBytes;
    };

    // Get all signatures for the current caller
    public shared query ({ caller }) func get_my_signatures() : async [Signature] {
        let callerSignatures = Buffer.Buffer<Signature>(0);

        for ((key, value) in signatures.entries()) {
            if (Principal.equal(key.signer, caller)) {
                callerSignatures.add(value);
            };
        };

        Buffer.toArray(callerSignatures);
    };

    // Get verification key for the current caller
    public shared ({ caller }) func get_my_verification_key() : async Blob {
        await VetKeys.ManagementCanister.blsPublicKey(
            null,
            context(caller),
            keyId(),
        );
    };
};
