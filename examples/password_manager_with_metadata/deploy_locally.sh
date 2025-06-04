#!/bin/bash

set -e

# Check that `dfx` is installed.
dfx --version >> /dev/null

# Run `dfx` if it is not already running.
dfx ping &> /dev/null || dfx start --background --clean >> /dev/null

# Deploy the Internet Identity canister and export the environment variable of
# the canister ID.
dfx deps pull && dfx deps init && dfx deps deploy

dfx canister create password_manager_with_metadata
dfx deploy --argument '("dfx_test_key")' password_manager_with_metadata

# Store environment variables for the frontend.
echo "DFX_NETWORK=$DFX_NETWORK" > frontend/.env
echo "CANISTER_ID_PASSWORD_MANAGER_WITH_METADATA=$(dfx canister id password_manager_with_metadata)" >> frontend/.env

# Build frontend.
pushd frontend
    npm i
    npm run build
popd

# Deploy canisters.
dfx deploy
