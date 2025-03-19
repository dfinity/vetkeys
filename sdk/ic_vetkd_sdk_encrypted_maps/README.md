# VetKD SDK - EncryptedMaps

> [!IMPORTANT]  
> These support libraries are under active development and are subject to change. Access to the repositories have been opened to allow for early feedback. Please check back regularly for updates.

The **EncryptedMaps** frontend library facilitates interaction with an **EncryptedMaps-enabled canister** on the **Internet Computer (ICP)**. It allows web applications to securely store, retrieve, and manage encrypted key-value pairs within named maps while handling user access control and key sharing.

## Core Features

- **Encrypted Key-Value Storage**: Store and retrieve encrypted key-value pairs within named maps.
- **Retrieve Encrypted VetKeys**: Fetch encrypted VetKeys and decrypt them locally using a **transport secret key**.
- **Access Shared Maps**: Query which maps a user has access to.
- **Manage User Access**: Assign, modify, and revoke user rights on stored maps.
- **Retrieve VetKey Verification Key**: Fetch the public verification key for validating VetKeys.

## Installation

This package is not yet published to npm.

## Usage

### 1. Initialize the EncryptedMaps Client

```ts
import { EncryptedMaps } from "ic-vetkd-sdk-encrypted-maps";

const encryptedMaps = new EncryptedMaps(encryptedMapsClientInstance);
```

### 2. Retrieve Shared Maps

```ts
const sharedMaps = await encryptedMaps.get_accessible_shared_map_names();
console.log("Shared Maps:", sharedMaps);
```

### 3. Retrieve a Stored Value

```ts
const mapOwner = Principal.fromText("aaaaa-aa");
const mapName = "passwords";
const mapKey = "email_account";

const storedValue = await encryptedMaps.get_value(mapOwner, mapName, mapKey);
if ("Err" in storedValue) {
  console.error("Error retrieving value:", storedValue.Err);
} else {
  console.log("Decrypted Value:", new TextDecoder().decode(storedValue.Ok));
}
```

### 4. Store an Encrypted Value

```ts
const value = new TextEncoder().encode("my_secure_password");
const result = await encryptedMaps.set_value(mapOwner, mapName, mapKey, value);
console.log("Replaced Value:", result);
```

### 5. Retrieve VetKey Verification Key

```ts
const verificationKey = await encryptedMaps.get_vetkey_verification_key();
console.log("Verification Key:", verificationKey);
```

### 6. Manage User Access Rights

#### a) Grant or Modify Access Rights

```ts
const owner = Principal.fromText("aaaaa-aa");
const user = Principal.fromText("bbbbbb-bb");
const accessRights = { ReadWrite: null };

const result = await encryptedMaps.set_user_rights(
  owner,
  mapName,
  user,
  accessRights,
);
console.log("Access Rights Updated:", result);
```

#### b) Check a User's Access Rights

```ts
const userRights = await encryptedMaps.get_user_rights(owner, mapName, user);
console.log("User Access Rights:", userRights);
```

#### c) Remove a User from a Map

```ts
const removalResult = await encryptedMaps.remove_user(owner, mapName, user);
console.log("User Removed:", removalResult);
```

## API Reference

### `EncryptedMaps`

- `new EncryptedMaps(canisterClient: EncryptedMapsClient)` → Initializes a new EncryptedMaps instance.
- `get_accessible_shared_map_names(): Promise<[Principal, ByteBuf][]>` → Retrieves a list of shared maps the user has access to.
- `get_owned_non_empty_map_names(): Promise<{ 'Ok': Array<ByteBuf> } | { 'Err': string }>` → Retrieves a list of non-empty maps owned by the caller.
- `get_value(owner: Principal, mapName: string, mapKey: string): Promise<{ 'Ok': Uint8Array } | { 'Err': string }>` → Retrieves and decrypts a stored value.
- `set_value(owner: Principal, mapName: string, mapKey: string, data: Uint8Array): Promise<{ 'Ok': Uint8Array } | { 'Err': string }>` → Stores an encrypted value.
- `get_vetkey_verification_key(): Promise<Uint8Array>` → Retrieves the VetKey verification key.
- `set_user_rights(owner: Principal, mapName: string, user: Principal, accessRights: AccessRights): Promise<{ 'Ok': [] | [AccessRights] } | { 'Err': string }>` → Grants or modifies access rights for a user.
- `get_user_rights(owner: Principal, mapName: string, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } | { 'Err': string }>` → Checks a user's access rights.
- `remove_user(owner: Principal, mapName: string, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } | { 'Err': string }>` → Revokes a user's access to a map.

### `AccessRights`

- `{ 'Read': null }` → User can read the map.
- `{ 'ReadWrite': null }` → User can read and modify the map.
- `{ 'ReadWriteManage': null }` → User can read, modify, and manage access control for the map.

## Security Considerations

- **Transport Secret Keys** should be generated securely and never shared.
- **Access Rights** should be carefully managed to prevent unauthorized access.
- VetKeys should be decrypted **only in trusted environments** to prevent leaks.
- **Ensure transport secret key randomness** to prevent predictable keys.
