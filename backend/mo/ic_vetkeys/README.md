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
import EncryptedMaps "mo:ic-vetkeys/encrypted_maps/EncryptedMaps";
import Types "mo:ic-vetkeys/Types";
import Runtime "mo:core/Runtime";

persistent actor {
    // `transient`: the key name is only an install-time input, baked into the
    // stable `encryptedMapsState` below and never read again.
    transient let keyName = Runtime.envVar<system>("VETKD_KEY_NAME") ?? "test_key_1";
    let encryptedMapsState = EncryptedMaps.newEncryptedMapsState<Types.AccessRights>(
        { curve = #bls12_381_g2; name = keyName },
        "my_app_domain_separator",
    );
    include EncryptedMapsCanister(encryptedMapsState);
};
```

The canister declares its own `EncryptedMapsState` stable variable and passes it to the mixin, so the state stays a plain, visible stable variable the canister owns and can migrate. Where the vetKD key name comes from is your choice; here it is read from the `VETKD_KEY_NAME` canister environment variable (set at deploy time via canister settings), defaulting to `test_key_1` so the canister always installs, so no actor class or install argument is needed.

The **vetKD key name is immutable for the life of the canister's data**: it feeds key derivation, so changing it after any value has been encrypted makes every stored value undecryptable. It is captured once into the stable state at install; changing `VETKD_KEY_NAME` on a later upgrade is silently ignored (the setting and the key in use can diverge), and only a `reinstall` (which drops all state) can switch keys. The `?? "test_key_1"` default keeps init total — a missing env var can never leave the canister half-initialized. Since `test_key_1` is also a valid mainnet key, a production deploy that forgets to set `VETKD_KEY_NAME` will silently run on it; assert the expected key at deploy time if that matters for your app.

If your canister keeps state linked to each value (e.g. a metadata row per entry) and must own the value read/write endpoints, `include` the `EncryptedMapsControlPlaneCanister` mixin (`mo:ic-vetkeys/encrypted_maps/ControlPlaneCanister`) instead: given the same `encryptedMapsState`, it provides the `encryptedMaps` instance and the control-plane endpoints, but omits the value endpoints so you can supply your own.

## Cross-language library
If Rust better suits your needs, take a look at the [Rust equivalent of this library](https://docs.rs/ic_vetkeys).
