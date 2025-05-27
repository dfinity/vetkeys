# Internet Computer (IC) vetKeys

This crate contains a set of tools designed to help canister developers integrate **vetKeys** into their Internet Computer (ICP) applications.

## [Key Manager](https://docs.rs/ic-vetkeys/latest/key_manager/struct.KeyManager.html)
A canister library for derivation of encrypted vetkeys from arbitrary strings. It can be used in combination with the [frontend key manager library](https://dfinity.github.io/vetkeys/classes/_dfinity_vetkeys_key_manager.KeyManager.html).

## [Encrypted Maps](https://docs.rs/ic-vetkeys/latest/encrypted_maps/struct.EncryptedMaps.html)
An efficient canister library facilitating access control and encrypted storage for a collection of maps contatining key-value pairs. It can be used in combination with the [frontend encrypted maps library](https://dfinity.github.io/vetkeys/classes/_dfinity_vetkeys_encrypted_maps.EncryptedMaps.html).

## [Utils](https://docs.rs/ic-vetkeys/latest/)
For obtaining and decrypting verifiably-encrypted threshold keys via the Internet Computer vetKD system API. The API is located in the crate root.
