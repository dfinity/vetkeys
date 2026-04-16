import type { BackendActor } from './actor';
import { get, set } from 'idb-keyval';

// Usage of the imported bindings only works if the respective .wasm was loaded, which is done in main.ts.
// See also https://github.com/rollup/plugins/tree/master/packages/wasm#using-with-wasm-bindgen-and-wasm-pack
import { DerivedKeyMaterial, TransportSecretKey, EncryptedVetKey, DerivedPublicKey } from "@dfinity/vetkeys";

const NOTE_KEY_DOMAIN = "note-key";

export class CryptoService {
  constructor(private actor: BackendActor) {
  }

  // The function encrypts data with the note-id-specific derived key material.
  public async encryptWithNoteKey(note_id: bigint, owner: string, data: string): Promise<string> {
    const keyMaterial = await this.fetch_note_key_if_needed(note_id, owner);
    const data_encoded = new TextEncoder().encode(data);
    const ciphertext = await keyMaterial.encryptMessage(data_encoded, NOTE_KEY_DOMAIN, new Uint8Array());
    return String.fromCharCode(...ciphertext);
  }

  // The function decrypts the given input data with the note-id-specific derived key material.
  public async decryptWithNoteKey(note_id: bigint, owner: string, data: string): Promise<string> {
    const keyMaterial = await this.fetch_note_key_if_needed(note_id, owner);
    const ciphertext = Uint8Array.from([...data].map(ch => ch.charCodeAt(0)));
    const decrypted = await keyMaterial.decryptMessage(ciphertext, NOTE_KEY_DOMAIN, new Uint8Array());
    return new TextDecoder().decode(decrypted);
  }

  private async fetch_note_key_if_needed(note_id: bigint, owner: string): Promise<DerivedKeyMaterial> {
    // CryptoKey survives IndexedDB round-trips; DerivedKeyMaterial (a class instance) does not.
    const cachedCryptoKey: CryptoKey | undefined = await get([note_id.toString(), owner]);
    if (cachedCryptoKey) return DerivedKeyMaterial.fromCryptoKey(cachedCryptoKey);

    const tsk = TransportSecretKey.random();

    const ek_bytes_hex = await this.actor.encrypted_symmetric_key_for_note(note_id, tsk.publicKeyBytes());
    const encryptedVetKey = EncryptedVetKey.deserialize(hex_decode(ek_bytes_hex));

    const pk_bytes_hex = await this.actor.symmetric_key_verification_key_for_note();
    const dpk = DerivedPublicKey.deserialize(hex_decode(pk_bytes_hex));

    const note_id_bytes: Uint8Array = bigintTo128BitBigEndianUint8Array(note_id);
    const owner_utf8: Uint8Array = new TextEncoder().encode(owner);
    const input = new Uint8Array(note_id_bytes.length + owner_utf8.length);
    input.set(note_id_bytes);
    input.set(owner_utf8, note_id_bytes.length);

    const vetKey = encryptedVetKey.decryptAndVerify(tsk, dpk, input);
    const keyMaterial = await vetKey.asDerivedKeyMaterial();
    await set([note_id.toString(), owner], keyMaterial.getCryptoKey());
    return keyMaterial;
  }
}

const hex_decode = (hexString: string): Uint8Array =>
  Uint8Array.from((hexString.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)));

// Inspired by https://coolaj86.com/articles/convert-js-bigints-to-typedarrays/
function bigintTo128BitBigEndianUint8Array(bn: bigint): Uint8Array {
  var hex = BigInt(bn).toString(16);

  // extend hex to length 32 = 16 bytes = 128 bits
  while (hex.length < 32) {
    hex = '0' + hex;
  }

  var len = hex.length / 2;
  var u8 = new Uint8Array(len);

  var i = 0;
  var j = 0;
  while (i < len) {
    u8[i] = parseInt(hex.slice(j, j + 2), 16);
    i += 1;
    j += 2;
  }

  return u8;
}
