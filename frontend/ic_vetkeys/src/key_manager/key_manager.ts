import { Principal } from "@dfinity/principal";
import { TransportSecretKey,EncryptedVetKey, DerivedPublicKey } from "../utils/utils";
import { AccessRights, ByteBuf } from "../declarations/ic_vetkeys_manager_canister/ic_vetkeys_manager_canister.did";

/**
 * > [!IMPORTANT]  
 * > These support libraries are under active development and are subject to change. Access to the repositories has been opened to allow for early feedback. Check back regularly for updates.
 * >
 * > Please share your feedback on the [developer forum](https://forum.dfinity.org/t/threshold-key-derivation-privacy-on-the-ic/16560/179).
 * 
 * The **`KeyManager`** frontend library facilitates interaction with a [**`KeyManager`-enabled canister**](https://docs.rs/ic_vetkeys/latest/TODO) on the **Internet Computer (ICP)**.
 * It allows web applications to securely request, decrypt, and manage VetKeys while handling access control and key sharing.
 * 
 * ## Core Features
 * 
 * - **Retrieve And Decrypt VetKeys**: Fetch encrypted VetKeys and decrypt them locally using a **transport secret key**.
 * - **Access Shared Keys Information**: Query which keys a user has access to.
 * - **Manage Key Access**: Assign, modify, and revoke user rights on stored keys.
 * - **Retrieve VetKey Verification Key**: Fetch the public verification key for validating encrypted VetKeys.
 * 
 * ## Security Considerations
 * 
 * - **Access Rights** should be carefully managed to prevent unauthorized access.
 * - VetKeys should be decrypted **only in trusted environments** such as user browsers to prevent leaks.
 * 
 * @example
 * ```ts
 * import { KeyManager } from "ic_vetkeys/tools";
 * 
 * // Initialize the KeyManager
 * const keyManager = new KeyManager(keyManagerClientInstance);
 * 
 * // Retrieve shared keys
 * const sharedKeys = await keyManager.get_accessible_shared_key_ids();
 * 
 * // Request and decrypt a VetKey
 * const keyOwner = Principal.fromText("aaaaa-aa");
 * const vetkeyName = "my_secure_key";
 * const vetkey = await keyManager.get_vetkey(keyOwner, vetkeyName);
 * 
 * // Manage user access rights
 * const user = Principal.fromText("bbbbbb-bb");
 * const accessRights = { ReadWrite: null };
 * const result = await keyManager.set_user_rights(keyOwner, vetkeyName, user, accessRights);
 * ```
 */
export class KeyManager {
    /**
     * The client instance for interacting with the KeyManager canister.
     */
    canister_client: KeyManagerClient;
    
    /**
     * Creates a new instance of the KeyManager.
     * 
     * @example
     * ```ts
     * import { KeyManager } from "ic_vetkeys/tools";
     * 
     * const keyManager = new KeyManager(keyManagerClientInstance);
     * ```
     */
    constructor(canister_client: KeyManagerClient) { this.canister_client = canister_client; }

    /**
     * Retrieves a list of keys that were shared with the user and the user still has access to.
     * 
     * @example
     * ```ts
     * const sharedKeys = await keyManager.get_accessible_shared_key_ids();
     * console.log("Shared Keys:", sharedKeys);
     * ```
     * 
     * @returns Promise resolving to an array of `[Principal, Uint8Array]` pairs representing accessible key identifiers.
     */
    async get_accessible_shared_key_ids(): Promise<[Principal, Uint8Array][]> {
        return (await this.canister_client.get_accessible_shared_key_ids()).map(([principal, byteBuf]) => {
            return [principal, Uint8Array.from(byteBuf.inner)];
        });
    }

    /**
     * Fetches and decrypts an encrypted VetKey.
     * 
     * @example
     * ```ts
     * const keyOwner = Principal.fromText("aaaaa-aa");
     * const vetkeyName = "my_secure_key";
     * 
     * const vetkey = await keyManager.get_vetkey(
     *   keyOwner,
     *   vetkeyName,
     * );
     * console.log("Decrypted VetKey:", vetkey);
     * ```
     * 
     * @param key_owner - The principal of the key owner
     * @param vetkey_name - The name/identifier of the VetKey
     * @returns Promise resolving to the decrypted VetKey bytes
     * @throws Error if the key retrieval or decryption fails
     */
    async get_vetkey(key_owner: Principal, vetkey_name: Uint8Array): Promise<Uint8Array> {
        // create a random transport key
        const seed = window.crypto.getRandomValues(new Uint8Array(32));
        const tsk = new TransportSecretKey(seed);
        const encrypted_vetkey = await this.canister_client.get_encrypted_vetkey(key_owner, arrayToByteBuf(vetkey_name), arrayToByteBuf(tsk.publicKeyBytes()));
        if ('Err' in encrypted_vetkey) {
            throw Error(encrypted_vetkey.Err);
        } else {
            const encrypted_key_bytes = Uint8Array.from(encrypted_vetkey.Ok.inner);
            const verification_key = await this.get_vetkey_verification_key();
            const derivedPublicKey = DerivedPublicKey.deserialize(Uint8Array.from(verification_key));
            const derivationId = new Uint8Array([key_owner.toUint8Array().length, ...key_owner.toUint8Array(), ...vetkey_name]);
            const encryptedDetkey = new EncryptedVetKey(encrypted_key_bytes);
            const vetkey = encryptedDetkey.decryptAndVerify(tsk, derivedPublicKey, derivationId);
            return vetkey.signatureBytes();
        }
    }

    /**
     * Retrieves the public verification key for validating encrypted VetKeys.
     * The vetkeys obtained via `get_vetkey` are verified using this key,
     * and, therefore, this method is not needed for using `get_vetkey`.
     * 
     * @example
     * ```ts
     * const verificationKey = await keyManager.get_vetkey_verification_key();
     * console.log("Verification Key:", verificationKey);
     * ```
     * 
     * @returns Promise resolving to the verification key bytes
     */
    async get_vetkey_verification_key(): Promise<Uint8Array> {
        return Uint8Array.from((await this.canister_client.get_vetkey_verification_key()).inner);
    }

    /**
     * Grants or modifies access rights for a user.
     * 
     * @example
     * ```ts
     * const owner = Principal.fromText("aaaaa-aa");
     * const keyName = "my_secure_key";
     * const user = Principal.fromText("bbbbbb-bb");
     * const accessRights = { ReadWrite: null };
     * 
     * const result = await keyManager.set_user_rights(
     *   owner,
     *   keyName,
     *   user,
     *   accessRights,
     * );
     * console.log("Replaced Access Rights:", result);
     * ```
     * 
     * @param owner - The principal of the key owner
     * @param vetkey_name - The name/identifier of the VetKey
     * @param user - The principal of the user to grant/modify rights for
     * @param user_rights - The access rights to grant
     * @returns Promise resolving to the previous access rights if they existed
     * @throws Error if the operation fails
     */
    async set_user_rights(owner: Principal, vetkey_name: Uint8Array, user: Principal, user_rights: AccessRights): Promise<AccessRights | undefined> {
        const result = await this.canister_client.set_user_rights(owner, arrayToByteBuf(vetkey_name), user, user_rights);
        if ('Err' in result) throw Error(result.Err);
        else if (result.Ok.length > 1) throw Error("Unexpected result from set_user_rights");

        const prevUserRights = result.Ok.length === 0 ? undefined : result.Ok[0];
        return prevUserRights;
    }

    /**
     * Checks a user's access rights.
     * 
     * @example
     * ```ts
     * const userRights = await keyManager.get_user_rights(owner, keyName, user);
     * console.log("User Access Rights:", userRights);
     * ```
     * 
     * @param owner - The principal of the key owner
     * @param vetkey_name - The name/identifier of the VetKey
     * @param user - The principal of the user to check rights for
     * @returns Promise resolving to the user's access rights if they exist
     * @throws Error if the operation fails
     */
    async get_user_rights(owner: Principal, vetkey_name: Uint8Array, user: Principal): Promise<AccessRights | undefined> {
        const result = await this.canister_client.get_user_rights(owner, arrayToByteBuf(vetkey_name), user);
        if ('Err' in result) throw Error(result.Err);
        else if (result.Ok.length > 1) throw Error("Unexpected result from set_user_rights");

        const userRights = result.Ok.length === 0 ? undefined : result.Ok[0];
        return userRights;
    }

    /**
     * Revokes a user's access.
     * 
     * @example
     * ```ts
     * const removalResult = await keyManager.remove_user(owner, keyName, user);
     * console.log("User Removed:", removalResult);
     * ```
     * 
     * @param owner - The principal of the key owner
     * @param vetkey_name - The name/identifier of the VetKey
     * @param user - The principal of the user to remove
     * @returns Promise resolving to the previous access rights if they existed
     * @throws Error if the operation fails
     */
    async remove_user(owner: Principal, vetkey_name: Uint8Array, user: Principal): Promise<AccessRights | undefined> {
        const result = await this.canister_client.remove_user(owner, arrayToByteBuf(vetkey_name), user);

        if ('Err' in result) throw Error(result.Err);
        else if (result.Ok.length > 1) throw Error("Unexpected result from set_user_rights");

        const userRights = result.Ok.length === 0 ? undefined : result.Ok[0];
        return userRights;
    }
}

/**
 * An interface that maps `KeyManager` calls to IC canister calls that will call the respective method of the backend `KeyManager`.
 * For example, `get_user_rights` will call the `get_user_rights` method of the backend `KeyManager`.
 * See the [Password Manager with Metadata Example]
 */
export interface KeyManagerClient {
    /**
     * Retrieves a list of keys that were shared with the user and the user still has access to.
     * 
     * @returns Promise resolving to an array of `[Principal, ByteBuf]` pairs representing accessible key identifiers.
     */
    get_accessible_shared_key_ids(): Promise<[Principal, ByteBuf][]>;

    /**
     * Grants or modifies access rights for a user.
     * 
     * @param owner - The principal of the key owner
     * @param vetkey_name - The name/identifier of the VetKey
     * @param user - The principal of the user to grant/modify rights for
     * @param user_rights - The access rights to grant
     * @returns Promise resolving to the previous access rights if they existed, or an error if the operation fails
     */
    set_user_rights(owner: Principal, vetkey_name: ByteBuf, user: Principal, user_rights: AccessRights): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }>;

    /**
     * Checks a user's access rights.
     * 
     * @param owner - The principal of the key owner
     * @param vetkey_name - The name/identifier of the VetKey
     * @param user - The principal of the user to check rights for
     * @returns Promise resolving to the user's access rights if they exist, or an error if the operation fails
     */
    get_user_rights(owner: Principal, vetkey_name: ByteBuf, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }>;

    /**
     * Revokes a user's access.
     * 
     * @param owner - The principal of the key owner
     * @param vetkey_name - The name/identifier of the VetKey
     * @param user - The principal of the user to remove
     * @returns Promise resolving to the previous access rights if they existed, or an error if the operation fails
     */
    remove_user(owner: Principal, vetkey_name: ByteBuf, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } |
    { 'Err': string }>;

    /**
     * Fetches an encrypted VetKey.
     * 
     * @param key_owner - The principal of the key owner
     * @param vetkey_name - The name/identifier of the VetKey
     * @param transport_key - The public transport key to use for encryption
     * @returns Promise resolving to the encrypted VetKey bytes, or an error if the operation fails
     */
    get_encrypted_vetkey(key_owner: Principal, vetkey_name: ByteBuf, transport_key: ByteBuf): Promise<{ 'Ok': ByteBuf } |
    { 'Err': string }>;

    /**
     * Retrieves the public verification key for validating encrypted VetKeys.
     * 
     * @returns Promise resolving to the verification key bytes
     */
    get_vetkey_verification_key(): Promise<ByteBuf>;
}

function arrayToByteBuf(a: Uint8Array): ByteBuf {
    return { inner: Array.from(a) };
}