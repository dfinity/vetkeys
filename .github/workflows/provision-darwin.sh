#!/bin/bash

set -ex

# Enter temporary directory.
pushd /tmp

# Install icp-cli (requires Node.js >=22, set up via actions/setup-node in the workflow).
npm install -g @icp-sdk/icp-cli @icp-sdk/ic-wasm ic-mops

# Install rust
curl --location --output install-rustup.sh "https://sh.rustup.rs"
bash install-rustup.sh -y
rustup target add wasm32-unknown-unknown

# Exit temporary directory.
popd
