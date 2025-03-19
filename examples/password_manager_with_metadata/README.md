# VetKey Password Manager with Metadata

> [!IMPORTANT]  
> These support libraries are under active development and are subject to change. Access to the repositories have been opened to allow for early feedback. Please check back regularly for updates.

The **VetKey Password Manager** is an example application demonstrating how to use **VetKeys** and **Encrypted Maps** to build a secure, decentralized password manager on the **Internet Computer (IC)**. This application allows users to create password vaults, store encrypted passwords, and share vaults with other users via their **Internet Identity Principal**.

This version of the application extends the basic password manager by supporting unencrypted metadata, such as URLs and tags, alongside encrypted passwords. The goal is to demonstrate how to make atomic updates to the Encrypted Maps canister, storing both encrypted and unencrypted data in a single update call.

## Features

- **Secure Password Storage**: Uses VetKey to encrypt passwords before storing them in Encrypted Maps.
- **Vault-Based Organization**: Users can create multiple vaults, each containing multiple passwords.
- **Access Control**: Vaults can be shared with other users via their **Internet Identity Principal**.
- **Atomic Updates**: Stores encrypted passwords along with unencrypted metadata in a single update call.

## Setup

### Prerequisites

- [Local Internet Computer dev environment](https://internetcomputer.org/docs/current/developer-docs/backend/rust/dev-env)
- [npm](https://www.npmjs.com/package/npm)

### Install Dependencies

```bash
npm install
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

- **[Basic Password Manager](../password_manager/README.md)** - If you want a simpler example without metadata.
