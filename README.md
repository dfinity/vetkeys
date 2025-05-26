# vetKeys

> [!IMPORTANT]  
> These support libraries are under active development and are subject to change. Access to the repositories has been opened to allow for early feedback. Check back regularly for updates.
>
> Please share your feedback on the [developer forum](https://forum.dfinity.org/t/threshold-key-derivation-privacy-on-the-ic/16560/179).

This repository contains a set of tools designed to help canister developers as well as frontend developers integrate **vetKeys** into their Internet Computer (ICP) applications.

**vetKeys** – Verifiable Encrypted Threshold Keys – on the Internet Computer addresses the fundamental challenge of storing secrets on-chain by allowing cryptographic key derivation without exposing private keys to anyone but the user. By leveraging **threshold cryptography**, vetKeys make it possible to generate, transport, and use encrypted keys securely, unlocking **privacy-preserving smart contracts** and **externally verifiable randomness**.

In slightly more detail, vetKeys enables use cases such as:

- **Decentralized key management**, secure threshold key derivation without relying on a traditional PKI - only the user knows the key.
- **Threshold BLS Signatures**, enabling secure, decentralized signing of messages.
- **Identity Based Encryption (IBE)**, enabling secure communication between users without exchanging public keys.
- **Verifiable Random Beacons**, providing a secure source of verifiable randomness for decentralized applications.
- **Smart contract defined vetKeys**, defining the constraints for obtaining derived keys/BLS signatures/verifiable randomness.

The management canister API for vetKeys exposes two endpoints, one for retrieving a public key and another one for deriving encrypted keys.

```
vetkd_public_key : (vetkd_public_key_args) -> (vetkd_public_key_result);
vetkd_derive_key : (vetkd_derive_key_args) -> (vetkd_derive_key_result);
```

For more documentation on vetKeys and the management canister API, see the [vetKeys documentation](https://internetcomputer.org/docs/building-apps/network-features/encryption/vetkeys).

## Key Features

### **1. [vetKeys Backend Library](./backend/rs/ic_vetkeys)** - Supports canister developers

Tools to help canister developers integrate vetKeys into their Internet Computer (ICP) applications.

- **[KeyManager](https://docs.rs/ic-vetkeys/latest/key_manager/struct.KeyManager.html)** – a library for deriving and managing encrypted cryptographic keys.
- **[EncryptedMaps](https://docs.rs/ic-vetkeys/latest/encrypted_maps/struct.EncryptedMaps.html)** – a library for encrypting using vetkeys, and securely storing and sharing encrypted key-value pairs.
- **[Utils](https://docs.rs/ic-vetkeys/latest/)** – Utility functions for working with vetKeys.

### **2. [vetKeys Frontend Library](./frontend/ic_vetkeys)** - Supports frontend developers

Tools for frontend developers to interact with VetKD enabled canisters.

- **[KeyManager](https://5lfyp-mqaaa-aaaag-aleqa-cai.icp0.io/classes/_dfinity_vetkeys_key_manager.KeyManager.html)** – Facilitates interaction with a KeyManager-enabled canister.
- **[EncryptedMaps](https://5lfyp-mqaaa-aaaag-aleqa-cai.icp0.io/classes/_dfinity_vetkeys_encrypted_maps.EncryptedMaps.html)** – Facilitates interaction with a EncryptedMaps-enabled canister.
- **[Utils](https://5lfyp-mqaaa-aaaag-aleqa-cai.icp0.io/modules/_dfinity_vetkeys.html)** – Utility functions for working with vetKeys.

### **3. vetKeys Password Manager** - Example application

The **VetKey Password Manager** is an example application demonstrating how to use vetKeys and Encrypted Maps to build a secure, decentralized password manager on the Internet Computer (IC). This application allows users to create password vaults, store encrypted passwords, and share vaults with other users via their Internet Identity Principal.

The example application is available in two versions:

- **[Basic Password Manager](./examples/password_manager)** - A simpler example without metadata.
- **[Password Manager with Metadata](./examples/password_manager_with_metadata)** - Supports unencrypted metadata alongside encrypted passwords.
