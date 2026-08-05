# Internet Computer (IC) vetKeys

This package contains a set of tools designed to help canister developers integrate **vetKeys** into their Internet Computer (ICP) applications.

## [Key Manager](https://mops.one/ic-vetkeys/docs/key_manager/KeyManager)
A canister library for derivation of encrypted vetkeys from arbitrary strings. It can be used in combination with the [frontend key manager library](https://dfinity.github.io/vetkeys/classes/_icp-sdk_vetkeys_key_manager.KeyManager.html).

## [Encrypted Maps](https://mops.one/ic-vetkeys/docs/encrypted_maps/EncryptedMaps)
An efficient canister library facilitating access control and encrypted storage for a collection of maps contatining key-value pairs. It can be used in combination with the [frontend encrypted maps library](https://dfinity.github.io/vetkeys/classes/_icp-sdk_vetkeys_encrypted_maps.EncryptedMaps.html).

## Ready-made EncryptedMaps canister

The `EncryptedMapsCanister` mixin (`mo:ic-vetkeys/encrypted_maps/Canister`) turns an actor into a complete EncryptedMaps canister in a few lines instead of ~200 lines of hand-written delegation:

```motoko
import EncryptedMapsCanister "mo:ic-vetkeys/encrypted_maps/Canister";

persistent actor {
    include EncryptedMapsCanister<system>("my_app_domain_separator");
};
```

The vetKD key name is read from the `VETKD_KEY_NAME` canister environment variable (set at deploy time via canister settings; the mixin traps if it is unset), so no actor class or install argument is needed.

If your canister keeps state linked to each value (e.g. a metadata row per entry) and must own the value read/write endpoints, `include` the `EncryptedMapsControlPlaneCanister` mixin (`mo:ic-vetkeys/encrypted_maps/ControlPlaneCanister`) instead: it provides the state, the `encryptedMaps` instance, and the control-plane endpoints, but omits the value endpoints so you can supply your own.

## Cross-language library
If Rust better suits your needs, take a look at the [Rust equivalent of this library](https://docs.rs/ic_vetkeys).
