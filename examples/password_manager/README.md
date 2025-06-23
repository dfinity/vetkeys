# VetKey Password Manager

> [!IMPORTANT]  
> These support libraries are under active development and are subject to change. Access to the repositories have been opened to allow for early feedback. Please check back regularly for updates.

The **VetKey Password Manager** is an example application demonstrating how to use **VetKeys** and **Encrypted Maps** to build a secure, decentralized password manager on the **Internet Computer (IC)**. This application allows users to create password vaults, store encrypted passwords, and share vaults with other users via their **Internet Identity Principal**.

## Features

- **Secure Password Storage**: Uses VetKey to encrypt passwords before storing them in Encrypted Maps.
- **Vault-Based Organization**: Users can create multiple vaults, each containing multiple passwords.
- **Access Control**: Vaults can be shared with other users via their **Internet Identity Principal**.

## Setup

### Prerequisites

- [Local Internet Computer dev environment](https://internetcomputer.org/docs/building-apps/getting-started/install)
- [npm](https://www.npmjs.com/package/npm)

### Install Frontend Dependencies

```bash
npm install
```

### (Optional) Change the Backend Canister Language

Instead of the default Motoko backend implementation, you can also use the Rust implementation by replacing `dfx.json` , which is a symlink to `dfx_configs/dfx_motoko.dfx`, with the Rust version of `dfx.json`:

```bash
ln -sf dfx_configs/dfx_rust.json dfx.json
```

Alternatively, overwrite the symlink with the file itself if that doesn't work:

```bash
cp dfx_configs/dfx_rust.json dfx.json
```

### Deploy the Canisters

```bash
bash deploy_locally.sh
```

## Running the Project

### Backend

The backend consists of an **Encrypted Maps**-enabled canister that securely stores passwords. It is automatically deployed with `deploy_locally.sh`.

### Frontend

The frontend is a **Svelte** application providing a user-friendly interface for managing vaults and passwords.

To run the frontend in development mode with hot reloading:

```bash
npm run dev
```

## Additional Resources

- **[Password Manager with Metadata](../password_manager_with_metadata/)** - If you need to store additional metadata alongside passwords.
