let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}


const lTextDecoder = typeof TextDecoder === 'undefined' ? (0, module.require)('util').TextDecoder : TextDecoder;

let cachedTextDecoder = new lTextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_export_0.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

const IBECiphertextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ibeciphertext_free(ptr >>> 0, 1));
/**
 * An IBE (identity based encryption) ciphertext
 */
export class IBECiphertext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(IBECiphertext.prototype);
        obj.__wbg_ptr = ptr;
        IBECiphertextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IBECiphertextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ibeciphertext_free(ptr, 0);
    }
    /**
     * Serialize this IBE ciphertext
     * @returns {Uint8Array}
     */
    serialize() {
        const ret = wasm.ibeciphertext_serialize(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Deserialize an IBE ciphertext
     *
     * Returns Err if the encoding is not valid
     * @param {Uint8Array} bytes
     * @returns {IBECiphertext}
     */
    static deserialize(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ibeciphertext_deserialize(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return IBECiphertext.__wrap(ret[0]);
    }
    /**
     * Encrypt a message using IBE
     *
     * The message can be of arbitrary length
     *
     * The seed must be exactly 256 bits (32 bytes) long and should be
     * generated with a cryptographically secure random number generator. Do
     * not reuse the seed for encrypting another message or any other purpose.
     * @param {Uint8Array} derived_public_key_bytes
     * @param {Uint8Array} derivation_id
     * @param {Uint8Array} msg
     * @param {Uint8Array} seed
     * @returns {IBECiphertext}
     */
    static encrypt(derived_public_key_bytes, derivation_id, msg, seed) {
        const ptr0 = passArray8ToWasm0(derived_public_key_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(derivation_id, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(msg, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.ibeciphertext_encrypt(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return IBECiphertext.__wrap(ret[0]);
    }
    /**
     * Decrypt an IBE ciphertext
     *
     * For proper operation k_bytes should be the result of calling
     * TransportSecretKey::decrypt where the same `derived_public_key_bytes`
     * and `derivation_id` were used when creating the ciphertext (with
     * IBECiphertext::encrypt).
     *
     * Returns the plaintext, or Err if decryption failed
     * @param {Uint8Array} k_bytes
     * @returns {Uint8Array}
     */
    decrypt(k_bytes) {
        const ptr0 = passArray8ToWasm0(k_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ibeciphertext_decrypt(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
}

const TransportSecretKeyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_transportsecretkey_free(ptr >>> 0, 1));
/**
 * Secret key of the transport key pair
 */
export class TransportSecretKey {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransportSecretKeyFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transportsecretkey_free(ptr, 0);
    }
    /**
     * Creates a transport secret key from a 32-byte seed.
     * @param {Uint8Array} seed
     */
    constructor(seed) {
        const ptr0 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.transportsecretkey_from_seed(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        TransportSecretKeyFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Returns the serialized public key associated with this secret key
     * @returns {Uint8Array}
     */
    public_key() {
        const ret = wasm.transportsecretkey_public_key(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Decrypts and verifies an encrypted key
     *
     * Returns the encoding of an elliptic curve point in BLS12-381 G1 group
     *
     * This is primarily useful for IBE; for symmetric key encryption use
     * decrypt_and_hash
     * @param {Uint8Array} encrypted_key_bytes
     * @param {Uint8Array} derived_public_key_bytes
     * @param {Uint8Array} derivation_id
     * @returns {Uint8Array}
     */
    decrypt(encrypted_key_bytes, derived_public_key_bytes, derivation_id) {
        const ptr0 = passArray8ToWasm0(encrypted_key_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(derived_public_key_bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(derivation_id, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.transportsecretkey_decrypt(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v4;
    }
    /**
     * Decrypts and verifies an encrypted key, and hashes it to a symmetric key
     *
     * The output length can be arbitrary and is specified by the caller
     *
     * The `symmetric_key_associated_data` field should include information about
     * the protocol and cipher that this key will be used for.
     * @param {Uint8Array} encrypted_key_bytes
     * @param {Uint8Array} derived_public_key_bytes
     * @param {Uint8Array} derivation_id
     * @param {number} symmetric_key_bytes
     * @param {Uint8Array} symmetric_key_associated_data
     * @returns {Uint8Array}
     */
    decrypt_and_hash(encrypted_key_bytes, derived_public_key_bytes, derivation_id, symmetric_key_bytes, symmetric_key_associated_data) {
        const ptr0 = passArray8ToWasm0(encrypted_key_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(derived_public_key_bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(derivation_id, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(symmetric_key_associated_data, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.transportsecretkey_decrypt_and_hash(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, symmetric_key_bytes, ptr3, len3);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v5 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v5;
    }
}

export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_export_0;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
    ;
};

export function __wbindgen_string_new(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

export function __wbindgen_throw(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

