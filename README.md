# VetKeys

> [!IMPORTANT]  
> These support libraries are under active development and are subject to change. Access to the repositories have been opened to allow for early feedback. Please check back regularly for updates.

This repository contains a set of tools designed to help canister developers as well as frontend developers integrate **VetKeys** into their Internet Computer (ICP) applications.

**VetKeys** – Verifiable Encrypted Threshold Keys – on the Internet Computer addresses the fundamental challenge of storing secrets on-chain by allowing cryptographic key derivation without exposing private keys. By leveraging **threshold cryptography**, VetKeys make it possible to generate, transport, and use encrypted keys securely, unlocking new use cases such as **privacy-preserving smart contracts, secure authentication, and decentralized identity management on blockchain networks**.

VetKeys enables use cases such as:

- **Decentralized key management** without relying on a traditional PKI.
- **Secure key derivation on demand** while ensuring privacy and confidentiality.
- **Threshold key derivation**, preventing any single party from having full control over keys.
- **Threshold BLS Signatures**, enabling secure, decentralized signing of messages.
- **Identity Based Encryption (IBE)**, enabling secure communication between users without exchanging public keys.
- **Verifiable Random Beacons**, providing a secure source of randomness for decentralized applications.

The management canister API for VetKeys exposes two endpoints, one for retrieving the public key and another for deriving keys.

```
vetkd_public_key : (vetkd_public_key_args) -> (vetkd_public_key_result);
vetkd_derive_key : (vetkd_derive_key_args) -> (vetkd_derive_key_result);
```

For more documentation on VetKeys and the management canister API, see the [VetKeys documentation](https://internetcomputer.org/docs/building-apps/network-features/encryption/vetkeys).

## Key Features

### **1. VetKeys CDK** - Supports canister developers

Tools to help canister developers integrate VetKeys into their Internet Computer (ICP) applications.

- **[KeyManager](./cdk/key_manager/README.md)** – a library for deriving and managing encrypted cryptographic keys.
- **[EncryptedMaps](./cdk/encrypted_maps/README.md)** – a library for securely storing and sharing encrypted key-value pairs.

### **2. VetKeys SDK** - Supports frontend developers

Tools for frontend developers to interact with VetKD enabled canisters.

- **[KeyManager](./sdk/ic_vetkd_sdk_key_manager/README.md)** – Facilitates interaction with a KeyManager-enabled canister
- **[EncryptedMaps](./sdk/ic_vetkd_sdk_encrypted_maps/README.md)** – Facilitates interaction with a EncryptedMaps-enabled canister
- **[SDK Utils](./sdk/ic_vetkd_sdk_utils/README.md)** – Utility functions for working with VetKeys

### **3. VetKeys Password Manager** - Example application

The **VetKey Password Manager** is an example application demonstrating how to use VetKeys and Encrypted Maps to build a secure, decentralized password manager on the Internet Computer (IC). This application allows users to create password vaults, store encrypted passwords, and share vaults with other users via their Internet Identity Principal.

The example application is available in two versions:

- **[Basic Password Manager](./examples/password_manager/README.md)** - A simpler example without metadata.
- **[Password Manager with Metadata](./examples/password_manager_with_metadata/README.md)** - Supports unencrypted metadata alongside encrypted passwords.
