# VetKD CDK - Canister Development Kit

## Overview

**VetKeys** enable secure, decentralized key management on the Internet Computer, addressing the fundamental challenge of storing secrets on-chain by allowing cryptographic key derivation without exposing private keys. By leveraging **threshold cryptography**, VetKeys make it possible to generate, transport, and use encrypted keys securely, unlocking new use cases such as **privacy-preserving smart contracts, secure authentication, and decentralized identity management on blockchain networks**.

**VetKD** (Verifiable Encrypted Threshold Key Derivation) provides a flexible mechanism for securely deriving and transporting cryptographic keys without a centralized key distribution authority. 

The **VetKD CDK** (Canister Development Kit) is a set of tools designed to help canister developers integrate **VetKeys** and **VetKD** into their Internet Computer (ICP) applications.

VetKD enables use cases such as:
- **Decentralized key management** without relying on a traditional PKI.
- **Secure key derivation on demand** while ensuring privacy and confidentiality.
- **Threshold key derivation**, preventing any single party from having full control over keys.

The VetKD CDK provides two main components to facilitate secure key management and data sharing:
1. **KeyManager** – a library for deriving and managing encrypted cryptographic keys.
2. **EncryptedMaps** – a library for securely storing and sharing encrypted key-value pairs.

## Key Features

### **1. KeyManager** – Secure Cryptographic Key Derivation
- Retrieve **public verification keys** from the VetKD system.
- Request **encrypted cryptographic keys** that are securely derived and encrypted.
- Share keys with specific users, granting **fine-grained access control** (read, write, manage).

For more details, see: **[KeyManager Documentation](./key_manager/README.md)**

### **2. EncryptedMaps** – Secure Encrypted Key-Value Storage
- Store encrypted key-value pairs within **named maps**.
- Define **user access permissions** for reading and modifying entries.
- Integrates with **KeyManager** to ensure secure access control.

For more details, see: **[EncryptedMaps Documentation](./encrypted_maps/README.md)**

## Getting Started

[To be completed]

## Security Considerations
- **Threshold Key Derivation:** No single node holds the full secret key, ensuring decentralized security.
- **Encrypted Key Transport:** Derived key shares are encrypted, preventing unauthorized access.
- **Fine-Grained Access Control:** Developers can define explicit permissions for shared keys and encrypted data.
- **Stable Storage:** Key permissions and encrypted data persist across canister upgrades.

## Conclusion
The **VetKD CDK** simplifies the integration of **VetKeys** and **VetKD** into ICP canisters, providing developers with secure key management and encrypted data storage. By leveraging **KeyManager** and **EncryptedMaps**, developers can enable secure, decentralized cryptographic operations within their applications.

