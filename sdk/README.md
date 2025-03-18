# VetKD SDK

Tools for frontend developers to interact with VetKD enabled canisters.

## Overview
**VetKeys** – Verifiable Encrypted Threshold Keys – on the Internet Computer addresses the fundamental challenge of storing secrets on-chain by allowing cryptographic key derivation without exposing private keys. By leveraging **threshold cryptography**, VetKeys make it possible to generate, transport, and use encrypted keys securely, unlocking new use cases such as **privacy-preserving smart contracts, secure authentication, and decentralized identity management on blockchain networks**.

VetKeys enables use cases such as:
- **Decentralized key management** without relying on a traditional PKI.
- **Secure key derivation on demand** while ensuring privacy and confidentiality.
- **Threshold key derivation**, preventing any single party from having full control over keys.

**The VetKey SDK is a work in progress, the final package layout and features are subject to change.**

## Packages

### **KeyManager** – Secure Cryptographic Key Derivation
- Retrieve **public verification keys** from the VetKey system.
- Request **encrypted cryptographic keys** that are securely derived and encrypted.
- Share keys with specific users, granting **fine-grained access control** (read, write, manage).

For more details, see: **[KeyManager Documentation](./ic_vetkd_sdk_key_manager/README.md)**

### **EncryptedMaps** – Secure Encrypted Key-Value Storage
- Store encrypted key-value pairs within **named maps**.
- Define **user access permissions** for reading and modifying entries.
- Integrates with **KeyManager** to ensure secure access control.

For more details, see: **[EncryptedMaps Documentation](./ic_vetkd_sdk_encrypted_maps/README.md)**
