# Internet Computer (IC) vetKeys

This crate contains a set of tools designed to help canister developers integrate **vetKeys** into their Internet Computer (ICP) applications.

The current Minimum Supported Rust Version (MSRV) of this crate is 1.85. Any future increase in the MSRV will be accompanied by a bump in the minor version number.

## [Key Manager](https://docs.rs/ic-vetkeys/latest/ic_vetkeys/key_manager/struct.KeyManager.html)
A canister library for derivation of encrypted vetkeys from arbitrary strings. It can be used in combination with the [frontend key manager library](https://dfinity.github.io/vetkeys/classes/_icp-sdk_vetkeys_key_manager.KeyManager.html).

## [Encrypted Maps](https://docs.rs/ic-vetkeys/latest/ic_vetkeys/encrypted_maps/struct.EncryptedMaps.html)
An efficient canister library facilitating access control and encrypted storage for a collection of maps contatining key-value pairs. It can be used in combination with the [frontend encrypted maps library](https://dfinity.github.io/vetkeys/classes/_icp-sdk_vetkeys_encrypted_maps.EncryptedMaps.html).

## Ready-made EncryptedMaps canister

The [`export_encrypted_maps_canister!`](https://docs.rs/ic-vetkeys/latest/ic_vetkeys/macro.export_encrypted_maps_canister.html) macro generates a complete EncryptedMaps canister — the `#[init]`/`#[post_upgrade]`, the stable state, and every endpoint the `@icp-sdk/vetkeys` frontend expects — in a few lines instead of ~200 of hand-written boilerplate:

```ignore
ic_vetkeys::export_encrypted_maps_canister!(
    "my_app_domain_separator",
    [memory(0), memory(1), memory(2), memory(3)],
);
ic_cdk::export_candid!();
```

If your canister keeps state linked to each value (e.g. a metadata row per entry) and must own the value read/write endpoints, pass `custom_value_endpoints`: the macro then generates the control-plane endpoints, state, lifecycle hooks, and `with_encrypted_maps`/`with_encrypted_maps_mut` accessors, but omits the value endpoints so you can provide your own. See the [macro documentation](https://docs.rs/ic-vetkeys/latest/ic_vetkeys/macro.export_encrypted_maps_canister.html) for the full setup and rationale.

## [Utils](https://docs.rs/ic-vetkeys/latest/)
For obtaining and decrypting verifiably-encrypted threshold keys via the Internet Computer vetKD system API. The API is located in the crate root.

## Cross-language library
If Motoko better suits your needs, take a look at the [Motoko equivalent of this library](https://mops.one/ic-vetkeys).
