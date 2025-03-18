# ic_vetkd_sdk_utils

## Overview
This package provides cryptographic utilities for working with VetKey (Verifiably Encrypted Threshold Key) derivation on the Internet Computer (IC). It includes support for BLS12-381 operations, transport secret keys, derived public keys, identity-based encryption (IBE), and symmetric key derivation.

## Installation

This package is not yet published to npm. 

## Usage

### Generating a Transport Secret Key
A transport secret key is used to decrypt VetKD-derived keys.
```ts
import { TransportSecretKey } from 'vetkd-crypto';

const tsk = TransportSecretKey.random();
console.log('Public Key:', tsk.publicKeyBytes());
```

### Deserializing a Derived Public Key
```ts
import { DerivedPublicKey } from 'vetkd-crypto';

const dpkBytes = new Uint8Array([...]); // Obtained from the IC
const dpk = DerivedPublicKey.deserialize(dpkBytes);
```

### Second-Stage Key Derivation
```ts
const context = new Uint8Array([1, 2, 3]);
const derivedKey = dpk.deriveKey(context);
console.log('Derived Public Key:', derivedKey.publicKeyBytes());
```

### VetKey Decryption
```ts
import { EncryptedKey, VetKey } from 'vetkd-crypto';

const encKeyBytes = new Uint8Array([...]); // Encrypted key from the IC
const encryptedKey = new EncryptedKey(encKeyBytes);
const vetKey = encryptedKey.decryptAndVerify(tsk, dpk, context);
console.log('Decrypted VetKey:', vetKey.signatureBytes());
```

### Identity-Based Encryption (IBE)

#### Encrypting a Message
```ts
import { IdentityBasedEncryptionCiphertext } from 'vetkd-crypto';

const message = new TextEncoder().encode('Secret message');
const seed = crypto.getRandomValues(new Uint8Array(32));
const ciphertext = IdentityBasedEncryptionCiphertext.encrypt(dpk, context, message, seed);
const serializedCiphertext = ciphertext.serialize();
```

#### Decrypting a Message
```ts
const deserializedCiphertext = IdentityBasedEncryptionCiphertext.deserialize(serializedCiphertext);
const decryptedMessage = deserializedCiphertext.decrypt(vetKey);
console.log('Decrypted Message:', new TextDecoder().decode(decryptedMessage));
```

## Security Considerations
- Always use a **cryptographically secure** random number generator.
- Keep transport secret keys **private**.
- Use unique domain separators for symmetric key derivation.

## License
MIT

