/* tslint:disable */
/* eslint-disable */
/**
 * An IBE (identity based encryption) ciphertext
 */
export class IBECiphertext {
  private constructor();
  free(): void;
  /**
   * Serialize this IBE ciphertext
   */
  serialize(): Uint8Array;
  /**
   * Deserialize an IBE ciphertext
   *
   * Returns Err if the encoding is not valid
   */
  static deserialize(bytes: Uint8Array): IBECiphertext;
  /**
   * Encrypt a message using IBE
   *
   * The message can be of arbitrary length
   *
   * The seed must be exactly 256 bits (32 bytes) long and should be
   * generated with a cryptographically secure random number generator. Do
   * not reuse the seed for encrypting another message or any other purpose.
   */
  static encrypt(derived_public_key_bytes: Uint8Array, derivation_id: Uint8Array, msg: Uint8Array, seed: Uint8Array): IBECiphertext;
  /**
   * Decrypt an IBE ciphertext
   *
   * For proper operation k_bytes should be the result of calling
   * TransportSecretKey::decrypt where the same `derived_public_key_bytes`
   * and `derivation_id` were used when creating the ciphertext (with
   * IBECiphertext::encrypt).
   *
   * Returns the plaintext, or Err if decryption failed
   */
  decrypt(k_bytes: Uint8Array): Uint8Array;
}
/**
 * Secret key of the transport key pair
 */
export class TransportSecretKey {
  free(): void;
  /**
   * Creates a transport secret key from a 32-byte seed.
   */
  constructor(seed: Uint8Array);
  /**
   * Returns the serialized public key associated with this secret key
   */
  public_key(): Uint8Array;
  /**
   * Decrypts and verifies an encrypted key
   *
   * Returns the encoding of an elliptic curve point in BLS12-381 G1 group
   *
   * This is primarily useful for IBE; for symmetric key encryption use
   * decrypt_and_hash
   */
  decrypt(encrypted_key_bytes: Uint8Array, derived_public_key_bytes: Uint8Array, derivation_id: Uint8Array): Uint8Array;
  /**
   * Decrypts and verifies an encrypted key, and hashes it to a symmetric key
   *
   * The output length can be arbitrary and is specified by the caller
   *
   * The `symmetric_key_associated_data` field should include information about
   * the protocol and cipher that this key will be used for.
   */
  decrypt_and_hash(encrypted_key_bytes: Uint8Array, derived_public_key_bytes: Uint8Array, derivation_id: Uint8Array, symmetric_key_bytes: number, symmetric_key_associated_data: Uint8Array): Uint8Array;
}
