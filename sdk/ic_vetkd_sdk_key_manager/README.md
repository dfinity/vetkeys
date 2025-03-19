# VetKD SDK - KeyManager

> [!IMPORTANT]  
> These support libraries are under active development and are subject to change. Access to the repositories have been opened to allow for early feedback. Please check back regularly for updates.

The **KeyManager** frontend library facilitates interaction with a **KeyManager-enabled canister** on the **Internet Computer (ICP)**. It allows web applications to securely request, decrypt, and manage VetKeys while handling access control and key sharing.

This package is designed to work in tandem with a **backend KeyManager canister**, enabling users to retrieve and manage cryptographic keys efficiently.

## Core Features

- **Retrieve Encrypted VetKeys**: Fetch encrypted VetKeys and decrypt them locally using a **transport secret key**.
- **Access Shared Keys**: Query which keys a user has access to.
- **Manage Key Access**: Assign, modify, and revoke user rights on stored keys.
- **Retrieve VetKey Verification Key**: Fetch the public verification key for validating VetKeys.

## Installation

This package is not yet published to npm.

## Usage

### 1. Initialize the KeyManager

```ts
import { KeyManager } from "[TBD]";

const keyManager = new KeyManager(canisterClientInstance);
```

### 2. Retrieve Shared Keys

```ts
const sharedKeys = await keyManager.get_accessible_shared_key_ids();
console.log("Shared Keys:", sharedKeys);
```

### 3. Request and Decrypt a VetKey

```ts
const keyOwner = Principal.fromText("aaaaa-aa");
const vetkeyName = "my_secure_key";

const encryptedKey = await keyManager.get_encrypted_vetkey(
  keyOwner,
  vetkeyName,
);
if ("Err" in encryptedKey) {
  console.error("Error retrieving key:", encryptedKey.Err);
} else {
  console.log("Decrypted VetKey:", encryptedKey.Ok.inner);
}
```

### 4. Retrieve VetKey Verification Key

```ts
const verificationKey = await keyManager.get_vetkey_verification_key();
console.log("Verification Key:", verificationKey);
```

### 5. Manage User Access Rights

#### a) Grant or Modify Access Rights

```ts
const owner = Principal.fromText("aaaaa-aa");
const keyName = "my_secure_key";
const user = Principal.fromText("bbbbbb-bb");
const accessRights = { ReadWrite: null };

const result = await keyManager.set_user_rights(
  owner,
  keyName,
  user,
  accessRights,
);
console.log("Replaced Access Rights:", result);
```

#### b) Check a User's Access Rights

```ts
const userRights = await keyManager.get_user_rights(owner, keyName, user);
console.log("User Access Rights:", userRights);
```

#### c) Remove a User from a Key

```ts
const removalResult = await keyManager.remove_user(owner, keyName, user);
console.log("User Removed:", removalResult);
```

## API Reference

### `KeyManager`

- `new KeyManager(canisterClient: KeyManagerClient)` → Initializes a new KeyManager instance.
- `get_accessible_shared_key_ids(): Promise<[Principal, ByteBuf][]>` → Retrieves a list of shared keys the user has access to.
- `get_encrypted_vetkey(owner: Principal, vetkeyName: string): Promise<{ 'Ok': ByteBuf } | { 'Err': string }>` → Fetches and decrypts an encrypted VetKey.
- `get_vetkey_verification_key(): Promise<ByteBuf>` → Retrieves the VetKey verification key.
- `set_user_rights(owner: Principal, vetkeyName: string, user: Principal, accessRights: AccessRights): Promise<{ 'Ok': [] | [AccessRights] } | { 'Err': string }>` → Grants or modifies access rights for a user.
- `get_user_rights(owner: Principal, vetkeyName: string, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } | { 'Err': string }>` → Checks a user's access rights.
- `remove_user(owner: Principal, vetkeyName: string, user: Principal): Promise<{ 'Ok': [] | [AccessRights] } | { 'Err': string }>` → Revokes a user's access.

### `AccessRights`

- `{ 'Read': null }` → User can read the key.
- `{ 'ReadWrite': null }` → User can read and update the key.
- `{ 'ReadWriteManage': null }` → User can read, update, and manage access control for the key.

## Security Considerations

- **Transport Secret Keys** should be generated securely and never shared.
- **Access Rights** should be carefully managed to prevent unauthorized access.
- VetKeys should be decrypted **only in trusted environments** to prevent leaks.
- **Ensure transport secret key randomness** to prevent predictable keys.
