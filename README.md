# VetKD Devkit

## Overview

**VetKeys** enable secure, decentralized key management on the Internet Computer, addressing the fundamental challenge of storing secrets on-chain by allowing cryptographic key derivation without exposing private keys. By leveraging **threshold cryptography**, VetKeys make it possible to generate, transport, and use encrypted keys securely, unlocking new use cases such as **privacy-preserving smart contracts, secure authentication, and decentralized identity management on blockchain networks**.

**VetKD** (Verifiable Encrypted Threshold Key Derivation) provides a flexible mechanism for securely deriving and transporting cryptographic keys without a centralized key distribution authority. 

VetKD enables use cases such as:
- **Decentralized key management** without relying on a traditional PKI.
- **Secure key derivation on demand** while ensuring privacy and confidentiality.
- **Threshold key derivation**, preventing any single party from having full control over keys.

The **VetKD Devkit** is a set of tools designed to help canister developers as well as frontend developers integrate **VetKeys** and **VetKD** into their Internet Computer (ICP) applications.

The devkit provides two main components: 
1. **VetKD CDK** - Canister Development Kit - A set of tools for canister developers.
2. **VetKD SDK** - Software Development Kit - A set of tools for frontend developers.

## Key Features

### **1. VetKD CDK** - Canister Development Kit

Tools to help canister developers integrate VetKeys and VetKD into their Internet Computer (ICP) applications.

- **KeyManager** – a library for deriving and managing encrypted cryptographic keys.
- **EncryptedMaps** – a library for securely storing and sharing encrypted key-value pairs.

For more details, see: **[VetKD CDK Documentation](./cdk/README.md)**

### **2. VetKD SDK** - Software Development Kit

Tools for frontend developers to interact with VetKD enabled canisters.

[to be completed]

For more details, see: **[VetKD SDK Documentation](./sdk/README.md)**