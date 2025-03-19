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

- **[Password Manager with Metadata](../password_manager_with_metadata/README.md)** - If you need to store additional metadata alongside passwords.
