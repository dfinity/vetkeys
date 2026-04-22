/**
 * @module @dfinity/vetkeys
 *
 * @description Provides frontend utilities for the low-level use of Verifiably Encrypted Threshold Keys (VetKeys) on the Internet Computer (IC) such as decryption of encrypted VetKeys, identity based encryption (IBE), and symmetric key derivation from a VetKey.
 *
 * ## Security Considerations
 *
 * - **Keep Transport Secret Keys Private:** Never expose the transport secret key as it is required for decrypting VetKeys.
 * - **Unique Domain Separators:** Use unique domain separators for symmetric key derivation to prevent cross-context attacks.
 * - **Authenticated Encryption:** Always verify ciphertext integrity when decrypting to prevent unauthorized modifications.
 * - **Secure Key Storage:** If storing symmetric keys, ensure they are exposed only in authorized environments such as user's browser page.
 */

export * from "./utils/utils";
