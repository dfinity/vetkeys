# VetKeys

## Overview

**VetKeys** – Verifiable Encrypted Threshold Keys – on the Internet Computer addresses the fundamental challenge of storing secrets on-chain by allowing cryptographic key derivation without exposing private keys. By leveraging **threshold cryptography**, VetKeys make it possible to generate, transport, and use encrypted keys securely, unlocking new use cases such as **privacy-preserving smart contracts, secure authentication, and decentralized identity management on blockchain networks**.

VetKeys enables use cases such as:
- **Decentralized key management** without relying on a traditional PKI.
- **Secure key derivation on demand** while ensuring privacy and confidentiality.
- **Threshold key derivation**, preventing any single party from having full control over keys.

This repository contains a set of tools designed to help canister developers as well as frontend developers integrate **VetKeys** into their Internet Computer (ICP) applications.

## Key Features

### **1. VetKeys CDK** - Supports canister developers

Tools to help canister developers integrate VetKeys into their Internet Computer (ICP) applications.

- **[KeyManager](./cdk/key_manager/README.md)** – a library for deriving and managing encrypted cryptographic keys.
- **[EncryptedMaps](./cdk/encrypted_maps/README.md)** – a library for securely storing and sharing encrypted key-value pairs.

For more details, see: **[VetKeys CDK Documentation](./cdk/README.md)**

### **2. VetKeys SDK** - Supports frontend developers

Tools for frontend developers to interact with VetKD enabled canisters.

[to be completed]

For more details, see: **[VetKeys SDK Documentation](./sdk/README.md)**