import { bls12_381 } from "@noble/curves/bls12-381";
import { ProjPointType } from "@noble/curves/abstract/weierstrass";
import { Fp, Fp2, Fp12 } from "@noble/curves/abstract/tower";
import { hash_to_field, Opts } from "@noble/curves/abstract/hash-to-curve";
import { shake256 } from "@noble/hashes/sha3";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import type { Principal } from "@dfinity/principal";

export type G1Point = ProjPointType<Fp>;
export type G2Point = ProjPointType<Fp2>;

const G1_BYTES = 48;
const G2_BYTES = 96;

/**
 * Transport Secret Key
 *
 * Applications using VetKD create an ephemeral transport secret key and send
 * the public key to the IC as part of their VetKD request. The returned VetKey
 * is encrypted, and can only be decrypted using the transport secret key.
 */
export class TransportSecretKey {
    readonly #sk: Uint8Array;
    readonly #pk: G1Point;

    /**
     * Construct a new TransportSecretKey from a bytestring
     *
     * The bytestring should be randomly generated by a cryptographically
     * secure random number generator.
     *
     * For most applications, prefer using the static method random
     */
    constructor(sk: Uint8Array) {
        if (sk.length !== 32) {
            throw new Error("Invalid size for transport secret key");
        }

        this.#sk = sk;

        const pk = bls12_381.G1.ProjectivePoint.fromPrivateKey(this.#sk);
        this.#pk = pk;
    }

    /**
     * Create a random transport secret key
     */
    static random() {
        return new TransportSecretKey(bls12_381.utils.randomPrivateKey());
    }

    /**
     * Return the encoding of the transport public key; this value is
     * sent to the IC
     */
    publicKeyBytes(): Uint8Array {
        return this.#pk.toRawBytes(true);
    }

    /**
     * Return the transport secret key value
     *
     * Applications would not normally need to call this
     */
    getSecretKey(): Uint8Array {
        return this.#sk;
    }
}

/**
 * Check if a transport public key is valid
 *
 * This tests if the passed byte array is of the expected size and encodes
 * a valid group element.
 */
export function isValidTransportPublicKey(tpk: Uint8Array): boolean {
    // We only accept compressed format for transport public keys
    if (tpk.length != 48) {
        return false;
    }

    try {
        bls12_381.G1.ProjectivePoint.fromHex(tpk);
        return true;
    } catch {
        return false;
    }
}

/**
 * Prefix a bytestring with its length
 */
function prefixWithLen(input: Uint8Array): Uint8Array {
    let length = input.length;

    const result = new Uint8Array(8 + length);

    for (let i = 7; i >= 0; i--) {
        result[i] = length & 0xff;
        length >>>= 8;
    }

    result.set(input, 8);

    return result;
}

/**
 * VetKD master key
 *
 * The VetKD subnet contains a small number of master keys, from which canister
 * keys are derived. In turn, many keys can be derived from the canister keys
 * using a context string.
 */
export class MasterPublicKey {
    readonly #pk: G2Point;

    /**
     * Read a MasterPublicKey from the bytestring encoding
     *
     * Normally the bytes provided here will have been returned by
     * the `vetkd_public_key` management canister interface.
     */
    static deserialize(bytes: Uint8Array): MasterPublicKey {
        return new MasterPublicKey(bls12_381.G2.ProjectivePoint.fromHex(bytes));
    }

    /**
     * Derive a canister master key from the subnet master key
     *
     * To create the derived public key in VetKD, a two step derivation is performed. The first step
     * creates a key that is specific to the canister that is making VetKD requests to the
     * management canister, sometimes called canister master key.
     *
     * This function can be used to compute canister master keys knowing just the subnet master key
     * plus the canister identity. This avoids having to interact with the IC for performing this
     * computation.
     */
    deriveKey(canister_id: Uint8Array): DerivedPublicKey {
        const dst = "ic-vetkd-bls12-381-g2-canister-id";
        const pkbytes = this.publicKeyBytes();
        const ro_input = new Uint8Array([
            ...prefixWithLen(pkbytes),
            ...prefixWithLen(canister_id),
        ]);
        const offset = hashToScalar(ro_input, dst);
        const g2_offset = bls12_381.G2.ProjectivePoint.BASE.multiply(offset);
        return new DerivedPublicKey(this.#pk.add(g2_offset));
    }

    /**
     * Return the bytestring encoding of the master public key
     */
    publicKeyBytes(): Uint8Array {
        return this.#pk.toRawBytes(true);
    }

    /**
     * TODO CRP-2797 add getter for the production subnet key once this has been
     * generated.
     */

    /**
     * @internal constructor
     */
    constructor(pk: G2Point) {
        this.#pk = pk;
    }
}

/**
 * VetKD derived public key
 *
 * An unencrypted VetKey is a BLS signature generated with a canister-specific
 * key. This type represents such keys.
 */
export class DerivedPublicKey {
    readonly #pk: G2Point;

    /**
     * Read a DerivedPublicKey from the bytestring encoding
     *
     * Normally the bytes provided here will have been returned by
     * the `vetkd_public_key` management canister interface.
     */
    static deserialize(bytes: Uint8Array): DerivedPublicKey {
        return new DerivedPublicKey(
            bls12_381.G2.ProjectivePoint.fromHex(bytes),
        );
    }

    /**
     * Perform second-stage derivation of a public key
     *
     * To create the derived public key in VetKD, a two step derivation is performed. The first step
     * creates a key that is specific to the canister that is making VetKD requests to the
     * management canister, sometimes called canister master key. The second step incorporates the
     * "derivation context" value provided to the `vetkd_public_key` management canister interface.
     *
     * If `vetkd_public_key` is invoked with an empty derivation context, it simply returns the
     * canister master key. Then the second derivation step can be done offline, using this
     * function. This is useful if you wish to derive multiple keys without having to interact with
     * the IC each time.
     *
     * If `context` is empty, then this simply returns the underlying key. This matches the behavior
     * of `vetkd_public_key`
     */
    deriveKey(context: Uint8Array): DerivedPublicKey {
        if (context.length === 0) {
            return this;
        } else {
            const dst = "ic-vetkd-bls12-381-g2-context";
            const pkbytes = this.publicKeyBytes();
            const ro_input = new Uint8Array([
                ...prefixWithLen(pkbytes),
                ...prefixWithLen(context),
            ]);
            const offset = hashToScalar(ro_input, dst);
            const g2_offset =
                bls12_381.G2.ProjectivePoint.BASE.multiply(offset);
            return new DerivedPublicKey(this.getPoint().add(g2_offset));
        }
    }

    /**
     * Return the bytestring encoding of the derived public key
     *
     * Applications would not normally need to call this, unless they
     * are using VetKD for creating a random beacon, in which case
     * these bytes are used by anyone verifying the beacon.
     */
    publicKeyBytes(): Uint8Array {
        return this.#pk.toRawBytes(true);
    }

    /**
     * @internal getter returning the point element of the derived public key
     *
     * Applications would not normally need to call this
     */
    getPoint(): G2Point {
        return this.#pk;
    }

    /**
     * @internal constructor
     */
    constructor(pk: G2Point) {
        this.#pk = pk;
    }
}

/**
 * Hash an input to a scalar in the BLS12-381 group
 *
 * This is useful if you want to derive a BLS12-381 secret key from some other
 * input data, but this is not a common operation.
 */
export function hashToScalar(input: Uint8Array, domainSep: string): bigint {
    const params = {
        p: bls12_381.params.r,
        m: 1,
        DST: domainSep,
    };

    const options = Object.assign(
        {},
        // @ts-expect-error (https://github.com/paulmillr/noble-curves/issues/179)
        bls12_381.G2.CURVE.htfDefaults,
        params,
    ) as Opts;

    const scalars = hash_to_field(input, 1, options);

    return scalars[0][0];
}

/**
 * @internal helper for data encoding
 */
function asBytes(input: Uint8Array | string): Uint8Array {
    if (typeof input === "string") {
        return new TextEncoder().encode(input);
    } else {
        return input;
    }
}

/**
 * @internal derive a symmetric key from the provided input
 *
 * The `input` parameter should be a sufficiently long random input.
 *
 * The `domainSep` parameter should be a string unique to your application and
 * also your usage of the resulting key. For example say your application
 * "my-app" is deriving two keys, one for usage "foo" and the other for
 * "bar". You might use as domain separators "my-app-foo" and "my-app-bar".
 */
export function deriveSymmetricKey(
    input: Uint8Array,
    domainSep: Uint8Array | string,
    outputLength: number,
): Uint8Array {
    const no_salt = new Uint8Array();
    return hkdf(sha256, input, no_salt, domainSep, outputLength);
}

/**
 * @internal hash a derived public key plus a message into the BLS12-381 G1 group
 *
 * This is not normally needed by applications using VetKD.
 */
export function augmentedHashToG1(
    pk: DerivedPublicKey,
    message: Uint8Array,
): G1Point {
    const domainSep = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_AUG_";
    const pkbytes = pk.publicKeyBytes();
    const input = new Uint8Array([...pkbytes, ...message]);
    const pt = bls12_381.G1.ProjectivePoint.fromAffine(
        bls12_381.G1.hashToCurve(input, {
            DST: domainSep,
        }).toAffine(),
    );

    return pt;
}

/**
 * Verify a BLS signature
 *
 * A VetKey is in the end a valid BLS signature; this function checks that a
 * provided BLS signature is the valid one for the provided public key and
 * message.
 *
 * When a VetKey struct is created (using EncryptedVetKey.decryptAndVerify) the signature
 * is already verified, so using this function is only necessary when
 * using a vetKey as a VRF or for threshold BLS signatures, with the bytes obtained
 * from VetKey.signatureBytes.
 */
export function verifyBlsSignature(
    pk: DerivedPublicKey,
    message: Uint8Array,
    signature: G1Point | Uint8Array,
): boolean {
    const neg_g2 = bls12_381.G2.ProjectivePoint.BASE.negate();
    const gt_one = bls12_381.fields.Fp12.ONE;

    const signaturePt =
        signature instanceof bls12_381.G1.ProjectivePoint
            ? signature
            : bls12_381.G1.ProjectivePoint.fromHex(signature);

    const messageG1 = augmentedHashToG1(pk, message);
    const check = bls12_381.pairingBatch([
        { g1: signaturePt, g2: neg_g2 },
        { g1: messageG1, g2: pk.getPoint() },
    ]);

    return bls12_381.fields.Fp12.eql(check, gt_one);
}

/**
 * A VetKey (verifiably encrypted threshold key)
 *
 * This is the end product of executing the VetKD protocol.
 *
 * Internally a VetKey is a valid BLS signature for the bytestring
 * `input` which provided when calling the `vetkd_derive_encrypted_key`
 * management canister interface.
 *
 * For certain usages, such as a beacon, the VetKey is actually used directly.
 * However the more common usage of VetKD protocol is for distribution of
 * encryption keys (eg AES keys to encrypt content).
 */
export class VetKey {
    readonly #pt: G1Point;
    readonly #bytes: Uint8Array;

    /**
     * Return the VetKey bytes, aka the BLS signature
     *
     * Use the raw bytes only if your design makes use of the fact that VetKeys
     * are BLS signatures (eg for random beacon or threshold BLS signature
     * generation). If you are using VetKD for key distribution, instead use
     * deriveSymmetricKey or asHkdfCryptoKey
     */
    signatureBytes(): Uint8Array {
        return this.#bytes;
    }

    /**
     * Derive a symmetric key of the requested length from the VetKey
     *
     * As an alternative to this function consider using asDerivedKeyMaterial,
     * which uses the WebCrypto API and prevents export of the underlying key.
     *
     * The `domainSep` parameter should be a string unique to your application and
     * also your usage of the resulting key. For example say your application
     * "my-app" is deriving two keys, one for usage "foo" and the other for
     * "bar". You might use as domain separators "my-app-foo" and "my-app-bar".
     */
    deriveSymmetricKey(
        domainSep: Uint8Array | string,
        outputLength: number,
    ): Uint8Array {
        return deriveSymmetricKey(this.#bytes, domainSep, outputLength);
    }

    /**
     * Return a DerivedKeyMaterial type which is suitable for further key derivation
     */
    async asDerivedKeyMaterial(): Promise<DerivedKeyMaterial> {
        return DerivedKeyMaterial.setup(this.#bytes);
    }

    /**
     * Deserialize a VetKey from the 48 byte encoding of the BLS signature
     *
     * This deserializes the same value as returned by signatureBytes
     */
    static deserialize(bytes: Uint8Array): VetKey {
        return new VetKey(bls12_381.G1.ProjectivePoint.fromHex(bytes));
    }

    /**
     * @internal getter returning the point object of the VetKey
     *
     * Applications would not usually need to call this
     */
    getPoint(): G1Point {
        return this.#pt;
    }

    /**
     * @internal constructor
     *
     * This is public for typing reasons but there is no reason for an application
     * to call this constructor.
     */
    constructor(pt: G1Point) {
        this.#pt = pt;
        this.#bytes = pt.toRawBytes(true);
    }
}

// The size of the nonce used for encryption by DerivedKeyMaterial
const DerivedKeyMaterialNonceLength = 12;

export class DerivedKeyMaterial {
    readonly #hkdf: CryptoKey;

    /**
     * @internal constructor
     */
    constructor(cryptokey: CryptoKey) {
        this.#hkdf = cryptokey;
    }

    /**
     * @internal constructor
     */
    static async setup(bytes: Uint8Array) {
        const exportable = false;
        const hkdf = await globalThis.crypto.subtle.importKey(
            "raw",
            bytes,
            "HKDF",
            exportable,
            ["deriveKey"],
        );
        return new DerivedKeyMaterial(hkdf);
    }

    /**
     * Return the CryptoKey
     */
    getCryptoKey(): CryptoKey {
        return this.#hkdf;
    }

    /**
     * Return a WebCrypto CryptoKey handle suitable for AES-GCM encryption/decryption
     *
     * The key is derived using HKDF with the provided domain separator
     *
     * The CryptoKey is not exportable
     */
    async deriveAesGcmCryptoKey(
        domainSep: Uint8Array | string,
    ): Promise<CryptoKey> {
        const exportable = false;

        const algorithm = {
            name: "HKDF",
            hash: "SHA-256",
            length: 32 * 8,
            info: asBytes(domainSep),
            salt: new Uint8Array(),
        };

        const gcmParams = {
            name: "AES-GCM",
            length: 32 * 8,
        };

        return globalThis.crypto.subtle.deriveKey(
            algorithm,
            this.#hkdf,
            gcmParams,
            exportable,
            ["encrypt", "decrypt"],
        );
    }

    /**
     * Encrypt the provided message using AES-GCM and a key derived using HKDF
     *
     * The GCM key is derived using HKDF with the provided domain separator
     */
    async encryptMessage(
        message: Uint8Array | string,
        domainSep: Uint8Array | string,
    ): Promise<Uint8Array> {
        const gcmKey = await this.deriveAesGcmCryptoKey(domainSep);

        // The nonce must never be reused with a given key
        const nonce = globalThis.crypto.getRandomValues(
            new Uint8Array(DerivedKeyMaterialNonceLength),
        );

        const ciphertext = new Uint8Array(
            await globalThis.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: nonce },
                gcmKey,
                asBytes(message),
            ),
        );

        // Concatenate the nonce to the beginning of the ciphertext
        return new Uint8Array([...nonce, ...ciphertext]);
    }

    /**
     * Decrypt the provided ciphertext using AES-GCM and a key derived using HKDF
     *
     * The GCM key is derived using HKDF with the provided domain separator
     */
    async decryptMessage(
        message: Uint8Array,
        domainSep: Uint8Array | string,
    ): Promise<Uint8Array> {
        const TagLength = 16;

        if (message.length < DerivedKeyMaterialNonceLength + TagLength) {
            throw new Error(
                "Invalid ciphertext, too short to possibly be valid",
            );
        }

        const nonce = message.slice(0, DerivedKeyMaterialNonceLength); // first 12 bytes are the nonce
        const ciphertext = message.slice(DerivedKeyMaterialNonceLength); // remainder GCM ciphertext

        const gcmKey = await this.deriveAesGcmCryptoKey(domainSep);

        try {
            const ptext = await globalThis.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: nonce },
                gcmKey,
                ciphertext,
            );
            return new Uint8Array(ptext);
        } catch {
            throw new Error("Decryption failed");
        }
    }
}

export class EncryptedVetKey {
    readonly #c1: G1Point;
    readonly #c2: G2Point;
    readonly #c3: G1Point;

    /**
     * Parse an encrypted key returned by the `vetkd_derive_encrypted_key`
     * managment canister interface
     */
    constructor(bytes: Uint8Array) {
        if (bytes.length !== G1_BYTES + G2_BYTES + G1_BYTES) {
            throw new Error("Invalid EncryptedVetKey serialization");
        }

        this.#c1 = bls12_381.G1.ProjectivePoint.fromHex(
            bytes.subarray(0, G1_BYTES),
        );
        this.#c2 = bls12_381.G2.ProjectivePoint.fromHex(
            bytes.subarray(G1_BYTES, G1_BYTES + G2_BYTES),
        );
        this.#c3 = bls12_381.G1.ProjectivePoint.fromHex(
            bytes.subarray(G1_BYTES + G2_BYTES),
        );
    }

    /**
     * Decrypt the encrypted key returning a VetKey
     */
    decryptAndVerify(
        tsk: TransportSecretKey,
        dpk: DerivedPublicKey,
        input: Uint8Array,
    ): VetKey {
        // Check that c1 and c2 have the same discrete logarithm, ie that e(c1, g2) == e(g1, c2)

        const g1 = bls12_381.G1.ProjectivePoint.BASE;
        const neg_g2 = bls12_381.G2.ProjectivePoint.BASE.negate();
        const gt_one = bls12_381.fields.Fp12.ONE;

        const c1_c2 = bls12_381.pairingBatch([
            { g1: this.#c1, g2: neg_g2 },
            { g1: g1, g2: this.#c2 },
        ]);

        if (!bls12_381.fields.Fp12.eql(c1_c2, gt_one)) {
            throw new Error("Invalid VetKey");
        }

        // Compute the purported vetKey k
        const c1_tsk = this.#c1.multiply(
            bls12_381.G1.normPrivateKeyToScalar(tsk.getSecretKey()),
        );
        const k = this.#c3.subtract(c1_tsk);

        // Verify that k is a valid BLS signature
        if (verifyBlsSignature(dpk, input, k)) {
            return new VetKey(k);
        } else {
            throw new Error("Invalid VetKey");
        }
    }
}

/* IBE (Identity Based Encryption) helper functions, not exported */

enum IbeDomainSeparators {
    HashToMask = "ic-vetkd-bls12-381-ibe-hash-to-mask",
    MaskSeed = "ic-vetkd-bls12-381-ibe-mask-seed",
    // Note that the messge length is appended to this
    MaskMsg = "ic-vetkd-bls12-381-ibe-mask-msg-",
}

// "IC IBE" (ASCII) plus 0x00 0x01 for future extensions/ciphersuites
const IBE_HEADER = new Uint8Array([
    0x49, 0x43, 0x20, 0x49, 0x42, 0x45, 0x00, 0x01,
]);
const IBE_HEADER_BYTES = 8;

function hashToMask(
    header: Uint8Array,
    seed: Uint8Array,
    msg: Uint8Array,
): bigint {
    const ro_input = new Uint8Array([...header, ...seed, ...msg]);
    return hashToScalar(ro_input, IbeDomainSeparators.HashToMask);
}

function xorBuf(a: Uint8Array, b: Uint8Array): Uint8Array {
    if (a.length !== b.length) {
        throw new Error("xorBuf arguments should have the same length");
    }
    const c = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
        c[i] = a[i] ^ b[i];
    }
    return c;
}

function maskSeed(seed: Uint8Array, t: Uint8Array): Uint8Array {
    if (t.length !== 576) {
        throw new Error("Unexpected size for Gt element");
    }
    const mask = deriveSymmetricKey(
        t,
        IbeDomainSeparators.MaskSeed,
        seed.length,
    );
    return xorBuf(mask, seed);
}

function maskMsg(msg: Uint8Array, seed: Uint8Array): Uint8Array {
    /*
    Zero prefix the length up to 20 digits, which is sufficient to be fixed
    length for any 64-bit length. This ensures all of the MaskMsg domain
    separators are of equal length. With how we use the domain separators, this
    padding isn't required - we only need uniquness - but having variable
    length domain separators is generally not considered a good practice and is
    easily avoidable here.
    */
    const domain_sep = IbeDomainSeparators.MaskMsg.concat(
        msg.length.toString().padStart(20, "0"),
    );
    const xof_seed = deriveSymmetricKey(seed, domain_sep, 32);

    const mask = shake256(xof_seed, { dkLen: msg.length });

    return xorBuf(msg, mask);
}

function serializeGtElem(gt: Fp12): Uint8Array {
    // noble-curves formats the Gt element bytes in reverse order
    const enc = bls12_381.fields.Fp12.toBytes(gt);

    const bytes = new Uint8Array(576);

    const shuffle = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

    for (let i = 0; i < 12; ++i) {
        const idx = shuffle[i];
        for (let j = 0; j < 48; ++j) {
            bytes[48 * i + j] = enc[48 * idx + j];
        }
    }

    return bytes;
}

function isEqual(x: Uint8Array, y: Uint8Array): boolean {
    if (x.length !== y.length) {
        return false;
    }

    let diff = 0;
    for (let i = 0; i < x.length; ++i) {
        diff |= x[i] ^ y[i];
    }
    return diff == 0;
}

/**
 * An identity used for identity based encryption
 *
 * As far as the IBE encryption scheme goes this is simply an opauqe bytestring
 * We provide a type to make code using the IBE a bit easier to understand
 */
export class IbeIdentity {
    readonly #identity: Uint8Array;

    private constructor(identity: Uint8Array) {
        this.#identity = identity;
    }

    /**
     * Create an identity from a byte string
     */
    static fromBytes(bytes: Uint8Array) {
        return new IbeIdentity(bytes);
    }

    /**
     * Create an identity from a string
     */
    static fromString(bytes: string) {
        return IbeIdentity.fromBytes(new TextEncoder().encode(bytes));
    }

    /**
     * Create an identity from a Principal
     */
    static fromPrincipal(principal: Principal) {
        return IbeIdentity.fromBytes(principal.toUint8Array());
    }

    /**
     * @internal getter returning the encoded
     */
    getBytes(): Uint8Array {
        return this.#identity;
    }
}

const SEED_BYTES = 32;

/**
 * A random seed, used for identity based encryption
 */
export class IbeSeed {
    readonly #seed: Uint8Array;

    private constructor(seed: Uint8Array) {
        // This should never happen as our callers ensure this
        if (seed.length !== SEED_BYTES) {
            throw new Error("IBE seed must be exactly SEED_BYTES long");
        }

        this.#seed = seed;
    }

    /**
     * Create a seed for IBE encryption from a byte string
     *
     * This input should be randomly chosen by a secure random number generator.
     * If the seed is not securely generated the IBE scheme will be insecure.
     *
     * At least 128 bits (16 bytes) must be provided.
     *
     * If the input is exactly 256 bits it is used directly. Otherwise the input
     * is hashed with HKDF to produce a 256 bit seed.
     */
    static fromBytes(bytes: Uint8Array) {
        if (bytes.length < 16) {
            throw new Error(
                "Insufficient input material for IbeSeed derivation",
            );
        } else if (bytes.length == SEED_BYTES) {
            return new IbeSeed(bytes);
        } else {
            return new IbeSeed(
                deriveSymmetricKey(
                    bytes,
                    "ic-vetkd-bls12-381-ibe-hash-seed",
                    SEED_BYTES,
                ),
            );
        }
    }

    /**
     * Create a random seed for IBE encryption
     */
    static random() {
        return new IbeSeed(
            globalThis.crypto.getRandomValues(new Uint8Array(SEED_BYTES)),
        );
    }

    /**
     * @internal getter returning the seed bytes
     */
    getBytes(): Uint8Array {
        return this.#seed;
    }
}

/**
 * IBE (Identity Based Encryption)
 */
export class IbeCiphertext {
    readonly #header: Uint8Array;
    readonly #c1: G2Point;
    readonly #c2: Uint8Array;
    readonly #c3: Uint8Array;

    /**
     * Serialize the IBE ciphertext to a bytestring
     */
    serialize(): Uint8Array {
        const c1bytes = this.#c1.toRawBytes(true);
        return new Uint8Array([
            ...this.#header,
            ...c1bytes,
            ...this.#c2,
            ...this.#c3,
        ]);
    }

    /**
     * Deserialize an IBE ciphertext
     */
    static deserialize(bytes: Uint8Array): IbeCiphertext {
        if (bytes.length < IBE_HEADER_BYTES + G2_BYTES + SEED_BYTES) {
            throw new Error("Invalid IBE ciphertext");
        }

        const header = bytes.subarray(0, IBE_HEADER_BYTES);
        const c1 = bls12_381.G2.ProjectivePoint.fromHex(
            bytes.subarray(IBE_HEADER_BYTES, IBE_HEADER_BYTES + G2_BYTES),
        );
        const c2 = bytes.subarray(
            IBE_HEADER_BYTES + G2_BYTES,
            IBE_HEADER_BYTES + G2_BYTES + SEED_BYTES,
        );
        const c3 = bytes.subarray(IBE_HEADER_BYTES + G2_BYTES + SEED_BYTES);

        if (!isEqual(header, IBE_HEADER)) {
            throw new Error("Unexpected header for IBE ciphertext");
        }

        return new IbeCiphertext(header, c1, c2, c3);
    }

    /**
     * Encrypt a message using IBE, returning the ciphertext
     *
     * The seed parameter must be a randomly generated value of exactly 32 bytes,
     * that was generated just for this one message. Using it for a second message,
     * or for any other purposes, compromises the security of the IBE scheme.
     *
     * Any user who is able to retrieve the VetKey for the specified
     * derived public key and identity will be able to decrypt this
     * message.
     */
    static encrypt(
        dpk: DerivedPublicKey,
        identity: IbeIdentity,
        msg: Uint8Array,
        seed: IbeSeed,
    ): IbeCiphertext {
        const header = IBE_HEADER;
        const t = hashToMask(header, seed.getBytes(), msg);
        const pt = augmentedHashToG1(dpk, identity.getBytes());
        const tsig = bls12_381.fields.Fp12.pow(
            bls12_381.pairing(pt, dpk.getPoint()),
            t,
        );

        const c1 = bls12_381.G2.ProjectivePoint.BASE.multiply(t);
        const c2 = maskSeed(seed.getBytes(), serializeGtElem(tsig));
        const c3 = maskMsg(msg, seed.getBytes());

        return new IbeCiphertext(header, c1, c2, c3);
    }

    /**
     * Decrypt an IBE ciphertext, returning the message
     */
    decrypt(vetkd: VetKey): Uint8Array {
        const k_c1 = bls12_381.pairing(vetkd.getPoint(), this.#c1);

        const seed = maskSeed(this.#c2, serializeGtElem(k_c1));

        const msg = maskMsg(this.#c3, seed);

        const t = hashToMask(this.#header, seed, msg);

        const g2_t = bls12_381.G2.ProjectivePoint.BASE.multiply(t);

        const valid = isEqual(g2_t.toRawBytes(true), this.#c1.toRawBytes(true));

        if (valid) {
            return msg;
        } else {
            throw new Error("Decryption failed");
        }
    }

    /**
     * Private constructor
     */
    private constructor(
        header: Uint8Array,
        c1: G2Point,
        c2: Uint8Array,
        c3: Uint8Array,
    ) {
        this.#header = header;
        this.#c1 = c1;
        this.#c2 = c2;
        this.#c3 = c3;
    }
}
