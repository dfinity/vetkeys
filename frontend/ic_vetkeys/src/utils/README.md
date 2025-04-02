# VetKD SDK - SDK Utils

> [!IMPORTANT]  
> These support libraries are under active development and are subject to change. Access to the repositories has been opened to allow for early feedback. Check back regularly for updates.
>
> Please share your feedback on the [developer forum](https://forum.dfinity.org/t/threshold-key-derivation-privacy-on-the-ic/16560/179).

This package provides cryptographic utilities for working with **VetKey** (Verifiably Encrypted Threshold Key) derivation on the **Internet Computer (IC)**. It includes support for **BLS12-381 operations**, **transport secret keys**, **derived public keys**, **identity-based encryption (IBE)**, and **symmetric key derivation**.

## Installation

This package is not yet published to npm.

## Usage

### 1. Generate a Transport Secret Key

A **transport secret key** is used to decrypt VetKD-derived keys.

```ts
import { TransportSecretKey } from "ic_vetkd_sdk_utils";

const tsk = TransportSecretKey.random();
console.log("Public Key:", tsk.publicKeyBytes());
```

### 2. Deserialize a Derived Public Key

```ts
import { DerivedPublicKey } from 'ic_vetkd_sdk_utils';

const dpkBytes = new Uint8Array([...]); // Obtained from the IC
const dpk = DerivedPublicKey.deserialize(dpkBytes);
```

### 3. Second-Stage Key Derivation

```ts
const context = new Uint8Array([1, 2, 3]);
const derivedKey = dpk.deriveKey(context);
console.log("Derived Public Key:", derivedKey.publicKeyBytes());
```

### 4. VetKey Decryption

```ts
import { EncryptedKey, VetKey } from 'ic_vetkd_sdk_utils';

const encKeyBytes = new Uint8Array([...]); // Encrypted key from the IC
const encryptedKey = new EncryptedKey(encKeyBytes);
const vetKey = encryptedKey.decryptAndVerify(tsk, dpk, context);
console.log('Decrypted VetKey:', vetKey.signatureBytes());
```

### 5. Identity-Based Encryption (IBE)

#### Encrypting a Message

```ts
import { IdentityBasedEncryptionCiphertext } from "ic_vetkd_sdk_utils";

const message = new TextEncoder().encode("Secret message");
const seed = crypto.getRandomValues(new Uint8Array(32));
const ciphertext = IdentityBasedEncryptionCiphertext.encrypt(
  dpk,
  context,
  message,
  seed,
);
const serializedCiphertext = ciphertext.serialize();
```

#### Decrypting a Message

```ts
const deserializedCiphertext =
  IdentityBasedEncryptionCiphertext.deserialize(serializedCiphertext);
const decryptedMessage = deserializedCiphertext.decrypt(vetKey);
console.log("Decrypted Message:", new TextDecoder().decode(decryptedMessage));
```

## API Reference

### `TransportSecretKey`

- `static random(): TransportSecretKey` → Creates a random transport secret key.
- `publicKeyBytes(): Uint8Array` → Returns the transport public key in bytes.
- `getSecretKey(): Uint8Array` → Returns the transport secret key bytes.

### `DerivedPublicKey`

- `static deserialize(bytes: Uint8Array): DerivedPublicKey` → Parses a derived public key from its serialized form.
- `deriveKey(context: Uint8Array): DerivedPublicKey` → Performs second-stage derivation to generate a context-specific key.
- `publicKeyBytes(): Uint8Array` → Returns the derived public key in bytes.

### `EncryptedKey`

- `constructor(bytes: Uint8Array)` → Parses an encrypted key returned by the IC.
- `decryptAndVerify(tsk: TransportSecretKey, dpk: DerivedPublicKey, derivation_id: Uint8Array): VetKey` → Decrypts an encrypted key and verifies its validity.

### `VetKey`

- `signatureBytes(): Uint8Array` → Returns the raw signature bytes of the VetKey.
- `deriveSymmetricKey(domainSep: string, outputLength: number): Uint8Array` → Derives a symmetric key from the VetKey.
- `async asHkdfCryptoKey(): Promise<CryptoKey>` → Converts the VetKey to a WebCrypto HKDF key.
- `async deriveAesGcmCryptoKey(domainSep: string): Promise<CryptoKey>` → Derives an AES-GCM key using HKDF.
- `async encryptMessage(message: Uint8Array | string, domainSep: string): Promise<Uint8Array>` → Encrypts a message using AES-GCM.
- `async decryptMessage(ciphertext: Uint8Array, domainSep: string): Promise<Uint8Array>` → Decrypts an AES-GCM encrypted message.
- `static deserialize(bytes: Uint8Array): VetKey` → Parses a VetKey from its serialized signature.

### `IdentityBasedEncryptionCiphertext`

- `static encrypt(dpk: DerivedPublicKey, derivation_id: Uint8Array, msg: Uint8Array, seed: Uint8Array): IdentityBasedEncryptionCiphertext` → Encrypts a message using Identity-Based Encryption.
- `static deserialize(bytes: Uint8Array): IdentityBasedEncryptionCiphertext` → Parses an IBE ciphertext.
- `decrypt(vetkd: VetKey): Uint8Array` → Decrypts an IBE-encrypted message using the VetKey.

## Security Considerations

- **Use Cryptographically Secure RNG:** Ensure all key generation and encryption operations use secure random number generation.
- **Keep Transport Secret Keys Private:** Never expose the transport secret key as it is required for decrypting VetKeys.
- **Unique Domain Separators:** Use unique domain separators for symmetric key derivation to prevent cross-context attacks.
- **Authenticated Encryption:** Always verify ciphertext integrity when decrypting to prevent unauthorized modifications.
- **Secure Key Storage:** If storing symmetric keys, ensure they are stored in a secure environment such as a hardware security module (HSM) or encrypted storage.
