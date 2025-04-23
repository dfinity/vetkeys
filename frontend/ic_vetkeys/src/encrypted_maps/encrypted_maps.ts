import { Principal } from "@dfinity/principal";
import { get, set } from 'idb-keyval';
import { TransportSecretKey, DerivedKeyMaterial, EncryptedVetKey, DerivedPublicKey } from "../utils/utils";
import { AccessRights, ByteBuf } from "../declarations/ic_vetkeys_manager_canister/ic_vetkeys_manager_canister.did";

/**
 * > [!IMPORTANT]  
 * > These support libraries are under active development and are subject to change. Access to the repositories has been opened to allow for early feedback. Check back regularly for updates.
 * >
 * > Please share your feedback on the [developer forum](https://forum.dfinity.org/t/threshold-key-derivation-privacy-on-the-ic/16560/179).
 * 
 * The **EncryptedMaps** frontend library facilitates interaction with an **EncryptedMaps-enabled canister** on the **Internet Computer (ICP)**.
 * It allows web applications to securely store, retrieve, and manage encrypted key-value pairs within named maps while handling user access control and key sharing.
 * 
 * ## Core Features
 * 
 * - **Encrypted Key-Value Storage**: Store and retrieve encrypted key-value pairs within named maps.
 * - **Retrieve Encrypted VetKeys**: Fetch encrypted VetKeys and decrypt them locally using a **transport secret key**.
 * - **Shared Maps Access Information**: Query which maps a user has access to.
 * - **Manage User Access**: Assign, modify, and revoke user rights on stored maps.
 * - **Retrieve VetKey Verification Key**: Fetch the public verification key for validating VetKeys.
 * 
 * ## Security Considerations
 * 
 * - **Access Rights** should be carefully managed to prevent unauthorized access.
 * - VetKeys should be decrypted **only in trusted environments** such as user browsers to prevent leaks.
 * 
 * @example
 * ```ts
 * import { EncryptedMaps } from "ic_vetkeys/tools";
 * 
 * // Initialize the EncryptedMaps Client
 * const encryptedMaps = new EncryptedMaps(encryptedMapsClientInstance);
 * 
 * // Retrieve shared maps
 * const sharedMaps = await encryptedMaps.get_accessible_shared_map_names();
 * 
 * const mapOwner = Principal.fromText("aaaaa-aa");
 * const mapName = "passwords";
 * const mapKey = "email_account";
 * 
 * // Store an encrypted value
 * const value = new TextEncoder().encode("my_secure_password");
 * const result = await encryptedMaps.set_value(mapOwner, mapName, mapKey, value);
 * 
 * // Retrieve a stored value
 * const storedValue = await encryptedMaps.get_value(mapOwner, mapName, mapKey);
 * 
 * // Manage user access rights
 * const user = Principal.fromText("bbbbbb-bb");
 * const accessRights = { ReadWrite: null };
 * const result = await encryptedMaps.set_user_rights(mapOwner, mapName, user, accessRights);
 * ```
 */
export class EncryptedMaps {
    /**
     * The client instance for interacting with the EncryptedMaps canister.
     */
    canister_client: EncryptedMapsClient;

    /**
     * The cached verification key for validating encrypted VetKeys.
     */
    verification_key: Uint8Array | undefined = undefined;

    /**
     * Creates a new instance of the EncryptedMaps client.
     * 
     * @example
     * ```ts
     * import { EncryptedMaps } from "ic_vetkeys/tools";
     * 
     * const encryptedMaps = new EncryptedMaps(encryptedMapsClientInstance);
     * ```
     */
    constructor(canister_client: EncryptedMapsClient) { this.canister_client = canister_client; }

    /**
     * Retrieves a list of maps that were shared with the user and the user still has access to.
     * 
     * @example
     * ```ts
     * const sharedMaps = await encryptedMaps.get_accessible_shared_map_names();
     * console.log("Shared Maps:", sharedMaps);
     * ```
     * 
     * @returns Promise resolving to an array of `[Principal, Uint8Array]` pairs representing accessible map identifiers.
     */
    async get_accessible_shared_map_names(): Promise<[Principal, Uint8Array][]> {
        return (await this.canister_client.get_accessible_shared_map_names()).map(([principal, byteBuf]) => {
            return [principal, Uint8Array.from(byteBuf.inner)];
        });
    }

    /**
     * Retrieves a list of non-empty maps owned by the caller.
     * 
     * @returns Promise resolving to an array of map names
     */
    async get_owned_non_empty_map_names(): Promise<Array<Uint8Array>> {
        return (await this.canister_client.get_owned_non_empty_map_names()).map((byteBuf) => {
            return Uint8Array.from(byteBuf.inner);
        });
    }

    /**
     * Retrieves all accessible values across all maps the user has access to.
     * 
     * @returns Promise resolving to an array of map data with decrypted values
     */
    async get_all_accessible_values(): Promise<Array<[[Principal, Uint8Array], Array<[Uint8Array, Uint8Array]>]>> {
        const result = await this.canister_client.get_all_accessible_encrypted_values();
        const decryptedResult: Array<[[Principal, Uint8Array], Array<[Uint8Array, Uint8Array]>]> = [];
        for (const [mapId, encryptedValues] of result) {
            const mapName = Uint8Array.from(mapId[1].inner);
            const keyValues: Array<[Uint8Array, Uint8Array]> = [];
            for (const [mapKeyBytes, encryptedValue] of encryptedValues) {
                const mapKey = Uint8Array.from(mapKeyBytes.inner);
                const value = await this.decrypt_for(mapId[0], mapName, mapKey, Uint8Array.from(encryptedValue.inner));
                keyValues.push([mapKey, value]);
            };
            decryptedResult.push([[mapId[0], Uint8Array.from(mapId[1].inner)], keyValues]);
        }

        return decryptedResult;
    }

    /**
     * Retrieves all accessible maps with their decrypted values.
     * 
     * @returns Promise resolving to an array of map data
     */
    async get_all_accessible_maps(): Promise<Array<MapData>> {
        const accessibleEncryptedMaps = await this.canister_client.get_all_accessible_encrypted_maps();
        const result: Array<MapData> = [];
        for (const encryptedMapData of accessibleEncryptedMaps) {
            const mapName = Uint8Array.from(encryptedMapData.map_name.inner);
            const keyvals: Array<[Uint8Array, Uint8Array]> = [];
            for (const [mapKeyBytes, encryptedValue] of encryptedMapData.keyvals) {
                const mapKey = Uint8Array.from(mapKeyBytes.inner);
                const decrypted = await this.decrypt_for(encryptedMapData.map_owner, mapName, mapKey, Uint8Array.from(encryptedValue.inner));
                keyvals.push([mapKey, decrypted]);
            }
            result.push({
                'access_control': encryptedMapData.access_control,
                'keyvals': keyvals,
                'map_name': mapName,
                'map_owner': encryptedMapData.map_owner,
            })
        }
        return result;
    }

    /**
     * Retrieves and decrypts a stored value from a map.
     * 
     * @example
     * ```ts
     * const mapOwner = Principal.fromText("aaaaa-aa");
     * const mapName = "passwords";
     * const mapKey = "email_account";
     * 
     * const storedValue = await encryptedMaps.get_value(mapOwner, mapName, mapKey);
     * console.log("Decrypted Value:", new TextDecoder().decode(storedValue));
     * ```
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param map_key - The key to retrieve
     * @returns Promise resolving to the decrypted value
     * @throws Error if the operation fails
     */
    async get_value(map_owner: Principal, map_name: Uint8Array, map_key: Uint8Array): Promise<Uint8Array> {
        const encrypted_value = await this.canister_client.get_encrypted_value(map_owner, arrayToByteBuf(map_name), arrayToByteBuf(map_key));
        if ("Err" in encrypted_value) { throw Error(encrypted_value.Err); }
        else if (encrypted_value.Ok.length === 0) { return new Uint8Array(0); }

        return await this.decrypt_for(map_owner, map_name, map_key, Uint8Array.from(encrypted_value.Ok[0].inner));
    }

    /**
     * Retrieves all values from a specific map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @returns Promise resolving to an array of key-value pairs
     * @throws Error if the operation fails
     */
    async get_values_for_map(map_owner: Principal, map_name: Uint8Array): Promise<Array<[Uint8Array, Uint8Array]>> {
        const encryptedValues = await this.canister_client.get_encrypted_values_for_map(map_owner, arrayToByteBuf(map_name));
        if ("Err" in encryptedValues) { throw Error(encryptedValues.Err); }

        const resultGet = new Array<[Uint8Array, Uint8Array]>();
        for (const [k, v] of encryptedValues.Ok) {
            resultGet.push([Uint8Array.from(k.inner), Uint8Array.from(v.inner)]);
        }

        const result = new Array<[Uint8Array, Uint8Array]>();
        for (const [mapKey, mapValue] of encryptedValues.Ok) {
            const passwordName = Uint8Array.from(mapKey.inner);
            const decrypted = await this.decrypt_for(map_owner, map_name, passwordName, Uint8Array.from(mapValue.inner));
            result.push([passwordName, decrypted]);
        }
        return result;
    }

    /**
     * Stores an encrypted value in a map.
     * 
     * @example
     * ```ts
     * const value = new TextEncoder().encode("my_secure_password");
     * const result = await encryptedMaps.set_value(mapOwner, mapName, mapKey, value);
     * console.log("Replaced Value:", result);
     * ```
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param map_key - The key to store
     * @param data - The value to store
     * @returns Promise resolving to the previous value if it existed
     * @throws Error if the operation fails
     */
    async set_value(map_owner: Principal, map_name: Uint8Array, map_key: Uint8Array, data: Uint8Array): Promise<Uint8Array | undefined> {
        const encrypted_value = await this.encrypt_for(map_owner, map_name, map_key, data);
        const insertion_result = await this.canister_client.insert_encrypted_value(map_owner, arrayToByteBuf(map_name), arrayToByteBuf(map_key), { inner: encrypted_value });
        if ("Err" in insertion_result) { throw Error(insertion_result.Err); }
        else if (insertion_result.Ok.length === 0) { return undefined; }
        return await this.decrypt_for(map_owner, map_name, map_key, Uint8Array.from(insertion_result.Ok[0].inner));
    }

    /**
     * Removes a value from a map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param map_key - The key to remove
     * @returns Promise resolving to the removed value if it existed
     * @throws Error if the operation fails
     */
    async remove_encrypted_value(map_owner: Principal, map_name: Uint8Array, map_key: Uint8Array): Promise<Uint8Array | undefined> {
        const encryptedResult = await this.canister_client.remove_encrypted_value(map_owner, arrayToByteBuf(map_name), arrayToByteBuf(map_key));
        if ("Err" in encryptedResult) { throw Error(encryptedResult.Err); }
        else if (encryptedResult.Ok.length === 0) { return undefined; }
        return await this.decrypt_for(map_owner, map_name, map_key, Uint8Array.from(encryptedResult.Ok[0].inner));
    }

    /**
     * Removes all values from a map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @returns Promise resolving to an array of removed keys
     * @throws Error if the operation fails
     */
    async remove_map_values(map_owner: Principal, map_name: Uint8Array): Promise<Array<Uint8Array>> {
        const encryptedResult = await this.canister_client.remove_map_values(map_owner, arrayToByteBuf(map_name));
        if ("Err" in encryptedResult) { throw Error(encryptedResult.Err); }
        else {
            return encryptedResult.Ok.map((mapKey) => Uint8Array.from(mapKey.inner));
        }
    }

    /**
     * Retrieves the public verification key for validating encrypted VetKeys.
     * The vetkeys obtained via `get_vetkey` are verified using this key,
     * and, therefore, this method is not needed for using `get_vetkey`.
     * 
     * @example
     * ```ts
     * const verificationKey = await encryptedMaps.get_vetkey_verification_key();
     * console.log("Verification Key:", verificationKey);
     * ```
     * 
     * @returns Promise resolving to the verification key bytes
     */
    async get_vetkey_verification_key(): Promise<Uint8Array> {
        if (!this.verification_key) {
            const verification_key = await this.canister_client.get_vetkey_verification_key();
            this.verification_key = Uint8Array.from(verification_key.inner);
        }
        return this.verification_key;
    }

    /**
     * Grants or modifies access rights for a user.
     * 
     * @example
     * ```ts
     * const owner = Principal.fromText("aaaaa-aa");
     * const user = Principal.fromText("bbbbbb-bb");
     * const accessRights = { ReadWrite: null };
     * 
     * const result = await encryptedMaps.set_user_rights(
     *   owner,
     *   mapName,
     *   user,
     *   accessRights,
     * );
     * console.log("Access Rights Updated:", result);
     * ```
     * 
     * @param owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param user - The principal of the user to grant/modify rights for
     * @param user_rights - The access rights to grant
     * @returns Promise resolving to the previous access rights if they existed
     * @throws Error if the operation fails
     */
    async set_user_rights(owner: Principal, map_name: Uint8Array, user: Principal, user_rights: AccessRights): Promise<AccessRights | undefined> {
        const result = await this.canister_client.set_user_rights(owner, arrayToByteBuf(map_name), user, user_rights);
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
     * const userRights = await encryptedMaps.get_user_rights(owner, mapName, user);
     * console.log("User Access Rights:", userRights);
     * ```
     * 
     * @param owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param user - The principal of the user to check rights for
     * @returns Promise resolving to the user's access rights if they exist
     * @throws Error if the operation fails
     */
    async get_user_rights(owner: Principal, map_name: Uint8Array, user: Principal): Promise<AccessRights | undefined> {
        const result = await this.canister_client.get_user_rights(owner, arrayToByteBuf(map_name), user);
        if ('Err' in result) throw Error(result.Err);
        else if (result.Ok.length > 1) throw Error("Unexpected result from set_user_rights");

        const userRights = result.Ok.length === 0 ? undefined : result.Ok[0];
        return userRights;
    }

    /**
     * Gets all users that have access to a map and their access rights.
     * 
     * @param owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @returns Promise resolving to an array of user-access rights pairs
     * @throws Error if the operation fails
     */
    async get_shared_user_access_for_map(owner: Principal, map_name: Uint8Array): Promise<Array<[Principal, AccessRights]>> {
        const result = await this.canister_client.get_shared_user_access_for_map(owner, arrayToByteBuf(map_name));
        if ("Err" in result) { throw Error(result.Err); }
        return result.Ok;
    }

    /**
     * Revokes a user's access.
     * 
     * @example
     * ```ts
     * const removalResult = await encryptedMaps.remove_user(owner, mapName, user);
     * console.log("User Removed:", removalResult);
     * ```
     * 
     * @param owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param user - The principal of the user to remove
     * @returns Promise resolving to the previous access rights if they existed
     * @throws Error if the operation fails
     */
    async remove_user(owner: Principal, map_name: Uint8Array, user: Principal): Promise<AccessRights | undefined> {
        const result = await this.canister_client.remove_user(owner, arrayToByteBuf(map_name), user);
        if ("Err" in result) { throw Error(result.Err); }
        const userRights = result.Ok.length === 0 ? undefined : result.Ok[0];
        return userRights;
    }

    /**
     * Derives a key material for a specific map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @returns Promise resolving to the derived key material
     * @throws Error if the operation fails
     */
    async getDerivedKeyMaterial(map_owner: Principal, map_name: Uint8Array): Promise<DerivedKeyMaterial> {
        const tsk = TransportSecretKey.random();
        const encrypted_vetkey = await this.canister_client.get_encrypted_vetkey(map_owner, arrayToByteBuf(map_name), arrayToByteBuf(tsk.publicKeyBytes()));
        if ('Err' in encrypted_vetkey) {
            throw Error(encrypted_vetkey.Err);
        } else {
            const encrypted_key_bytes = Uint8Array.from(encrypted_vetkey.Ok.inner);
            const verification_key = await this.get_vetkey_verification_key();
            const derivationId = new Uint8Array([map_owner.toUint8Array().length, ...map_owner.toUint8Array(), ...map_name]);

            const encryptedVetKey = new EncryptedVetKey(encrypted_key_bytes);
            const derivedPublicKey = DerivedPublicKey.deserialize(verification_key);
            const vetKey = encryptedVetKey.decryptAndVerify(tsk, derivedPublicKey, derivationId);
            return await vetKey.asDerivedKeyMaterial();
        }
    }

    /**
     * Encrypts a value for a specific map and key.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param map_key - The key to encrypt for
     * @param cleartext - The value to encrypt
     * @returns Promise resolving to the encrypted value
     */
    async encrypt_for(map_owner: Principal, map_name: Uint8Array, map_key: Uint8Array, cleartext: Uint8Array): Promise<Uint8Array> {
        const derivedKeyMaterial = await this.getDerivedKeyMaterialOrFetchIfNeeded(map_owner, map_name);
        return await derivedKeyMaterial.encryptMessage(cleartext, map_key);
    }

    /**
     * Decrypts a value for a specific map and key.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param map_key - The key to decrypt for
     * @param encrypted_value - The value to decrypt
     * @returns Promise resolving to the decrypted value
     */
    async decrypt_for(map_owner: Principal, map_name: Uint8Array, map_key: Uint8Array, encrypted_value: Uint8Array): Promise<Uint8Array> {
        const derivedKeyMaterial = await this.getDerivedKeyMaterialOrFetchIfNeeded(map_owner, map_name);
        return await derivedKeyMaterial.decryptMessage(encrypted_value, map_key);
    }

    /**
     * Gets or fetches the derived key material for a map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @returns Promise resolving to the derived key material
     */
    async getDerivedKeyMaterialOrFetchIfNeeded(map_owner: Principal, map_name: Uint8Array): Promise<DerivedKeyMaterial> {
        const cachedRawDerivedKeyMaterial: CryptoKey | undefined = await get([map_owner.toString(), map_name]);
        if (cachedRawDerivedKeyMaterial) { return new DerivedKeyMaterial(cachedRawDerivedKeyMaterial); }

        const derivedKeyMaterial = await this.getDerivedKeyMaterial(map_owner, map_name);
        await set([map_owner.toString(), map_name], derivedKeyMaterial.getCryptoKey());
        return derivedKeyMaterial;
    }
}

/**
 * Interface for map data structure.
 */
export interface MapData {
    'access_control': Array<[Principal, AccessRights]>,
    'keyvals': Array<[Uint8Array, Uint8Array]>,
    'map_name': Uint8Array,
    'map_owner': Principal,
}

/**
 * An interface that maps `EncryptedMaps` calls to IC canister calls that will call the respective method of the backend `EncryptedMaps`.
 * For example, `get_user_rights` will call the `get_user_rights` method of the backend `EncryptedMaps`.
 */
export interface EncryptedMapsClient {
    /**
     * Retrieves a list of maps that were shared with the user and the user still has access to.
     * 
     * @returns Promise resolving to an array of `[Principal, ByteBuf]` pairs representing accessible map identifiers.
     */
    get_accessible_shared_map_names(): Promise<[Principal, ByteBuf][]>;

    /**
     * Gets all users that have access to a map and their access rights.
     * 
     * @param owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @returns Promise resolving to an array of user-access rights pairs, or an error if the operation fails
     */
    get_shared_user_access_for_map(owner: Principal, map_name: ByteBuf): Promise<{ 'Ok': Array<[Principal, AccessRights]> } | { 'Err': string }>;

    /**
     * Retrieves a list of non-empty maps owned by the caller.
     * 
     * @returns Promise resolving to an array of map names
     */
    get_owned_non_empty_map_names(): Promise<Array<ByteBuf>>;

    /**
     * Retrieves all accessible values across all maps the user has access to.
     * 
     * @returns Promise resolving to an array of map data with encrypted values
     */
    get_all_accessible_encrypted_values(): Promise<[[Principal, ByteBuf], [ByteBuf, ByteBuf][]][]>;

    /**
     * Retrieves all accessible maps with their encrypted values.
     * 
     * @returns Promise resolving to an array of encrypted map data
     */
    get_all_accessible_encrypted_maps(): Promise<Array<EncryptedMapData>>;

    /**
     * Retrieves an encrypted value from a map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param map_key - The key to retrieve
     * @returns Promise resolving to the encrypted value if it exists, or an error if the operation fails
     */
    get_encrypted_value(map_owner: Principal, map_name: ByteBuf, map_key: ByteBuf): Promise<{ 'Ok': [] | [ByteBuf] } | { 'Err': string }>;

    /**
     * Retrieves all encrypted values from a specific map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @returns Promise resolving to an array of key-value pairs, or an error if the operation fails
     */
    get_encrypted_values_for_map(map_owner: Principal, map_name: ByteBuf): Promise<{ 'Ok': Array<[ByteBuf, ByteBuf]> } | { 'Err': string }>;

    /**
     * Stores an encrypted value in a map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param map_key - The key to store
     * @param data - The encrypted value to store
     * @returns Promise resolving to the previous value if it existed, or an error if the operation fails
     */
    insert_encrypted_value(map_owner: Principal, map_name: ByteBuf, map_key: ByteBuf, data: ByteBuf): Promise<{ 'Ok': [] | [ByteBuf] } | { 'Err': string }>;

    /**
     * Removes a value from a map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param map_key - The key to remove
     * @returns Promise resolving to the removed value if it existed, or an error if the operation fails
     */
    remove_encrypted_value(map_owner: Principal, map_name: ByteBuf, map_key: ByteBuf): Promise<{ 'Ok': [] | [ByteBuf] } | { 'Err': string }>;

    /**
     * Removes all values from a map.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @returns Promise resolving to an array of removed keys, or an error if the operation fails
     */
    remove_map_values(map_owner: Principal, map_name: ByteBuf): Promise<{ 'Ok': Array<ByteBuf> } | { 'Err': string }>;

    /**
     * Grants or modifies access rights for a user.
     * 
     * @param owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param user - The principal of the user to grant/modify rights for
     * @param user_rights - The access rights to grant
     * @returns Promise resolving to the previous access rights if they existed, or an error if the operation fails
     */
    set_user_rights(owner: Principal, map_name: ByteBuf, user: Principal, user_rights: AccessRights): Promise<{ 'Ok': [] | [AccessRights] } | { 'Err': string }>;

    /**
     * Checks a user's access rights.
     * 
     * @param owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param user - The principal of the user to check rights for
     * @returns Promise resolving to the user's access rights if they exist, or an error if the operation fails
     */
    get_user_rights(owner: Principal, map_name: ByteBuf, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } | { 'Err': string }>;

    /**
     * Revokes a user's access.
     * 
     * @param owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param user - The principal of the user to remove
     * @returns Promise resolving to the previous access rights if they existed, or an error if the operation fails
     */
    remove_user(owner: Principal, map_name: ByteBuf, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } | { 'Err': string }>;

    /**
     * Fetches an encrypted VetKey.
     * 
     * @param map_owner - The principal of the map owner
     * @param map_name - The name/identifier of the map
     * @param transport_key - The public transport key to use for encryption
     * @returns Promise resolving to the encrypted VetKey bytes, or an error if the operation fails
     */
    get_encrypted_vetkey(map_owner: Principal, map_name: ByteBuf, transport_key: ByteBuf): Promise<{ 'Ok': ByteBuf } | { 'Err': string }>;

    /**
     * Retrieves the public verification key for validating encrypted VetKeys.
     * 
     * @returns Promise resolving to the verification key bytes
     */
    get_vetkey_verification_key(): Promise<ByteBuf>;
}

/**
 * This interface represents the structure of an encrypted map as stored in the backend canister.
 * It contains all the necessary information about a map, including its access control settings,
 * encrypted key-value pairs, and metadata.
 */
export interface EncryptedMapData {
    /**
     * Access control list for the map (excluding the map owner), specifying which users have what level of access.
     * Each entry is a tuple of [Principal, AccessRights] where:
     * - Principal: The user's identity
     * - AccessRights: The level of access granted (Read, ReadWrite, or ReadWriteManage)
     */
    'access_control': Array<[Principal, AccessRights]>,

    /**
     * The encrypted key-value pairs stored in the map.
     * Each entry is a tuple of [ByteBuf, ByteBuf] where:
     * - First ByteBuf: The encrypted key
     * - Second ByteBuf: The encrypted value
     */
    'keyvals': Array<[ByteBuf, ByteBuf]>,

    /**
     * The name/identifier of the map.
     * This is used to uniquely identify the map within the system.
     */
    'map_name': ByteBuf,

    /**
     * The principal of the map owner.
     * This identifies who created and owns the map.
     */
    'map_owner': Principal,
}

function arrayToByteBuf(a: Uint8Array): ByteBuf {
    return { inner: a };
}