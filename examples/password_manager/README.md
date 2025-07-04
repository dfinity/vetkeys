# VetKey Password Manager

| Motoko backend | [![](https://icp.ninja/assets/open.svg)](http://icp.ninja/editor?g=https://github.com/dfinity/vetkeys/tree/main/examples/password_manager/motoko)|
| --- | --- |
| Rust backend | [![](https://icp.ninja/assets/open.svg)](http://icp.ninja/editor?g=https://github.com/dfinity/vetkeys/tree/main/examples/password_manager/rust) |

The **VetKey Password Manager** is an example application demonstrating how to use **VetKeys** and **Encrypted Maps** to build a secure, decentralized password manager on the **Internet Computer (IC)**. This application allows users to create password vaults, store encrypted passwords, and share vaults with other users via their **Internet Identity Principal**.

## Features

- **Secure Password Storage**: Uses VetKey to encrypt passwords before storing them in Encrypted Maps.
- **Vault-Based Organization**: Users can create multiple vaults, each containing multiple passwords.
- **Access Control**: Vaults can be shared with other users via their **Internet Identity Principal**.

## Setup

### Prerequisites

- [Local Internet Computer dev environment](https://internetcomputer.org/docs/building-apps/getting-started/install)
- [npm](https://www.npmjs.com/package/npm)

### Deploy the Canisters Locally
If you want to deploy this project locally with a Motoko backend, then run:
```bash
dfx start --background && dfx deploy
```
from the `motoko` folder.

To use the Rust backend instead of Motoko, run the same command in the `rust` folder.

## Running the Project

### Backend

The backend consists of an **Encrypted Maps**-enabled canister that securely stores passwords. It is automatically deployed with `dfx deploy`.

### Frontend

The frontend is a **Svelte** application providing a user-friendly interface for managing vaults and passwords.

To run the frontend in development mode with hot reloading:

```bash
npm run dev
```

## Additional Resources

- **[Password Manager with Metadata](../password_manager_with_metadata/)** - If you need to store additional metadata alongside passwords.
