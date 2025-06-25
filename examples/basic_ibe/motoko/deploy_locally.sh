#!/bin/bash

set -e

# Check that `dfx` is installed.
dfx --version >> /dev/null

# Run `dfx` if it is not already running.
dfx ping &> /dev/null || dfx start --background --clean >> /dev/null

# Deploy backend canister.
dfx deploy --argument '("dfx_test_key")' basic_ibe

# Deploy frontend canister.
dfx deploy www
