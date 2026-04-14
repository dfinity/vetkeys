#!/bin/bash

set -ex

# Enter temporary directory.
pushd /tmp

# Install icp-cli (requires Node.js >=22, set up via actions/setup-node in the workflow).
npm install -g @icp-sdk/icp-cli @icp-sdk/ic-wasm

# Install rust
wget --output-document install-rustup.sh "https://sh.rustup.rs"
sudo bash install-rustup.sh -y
rustup target add wasm32-unknown-unknown

# Set environment variables.
echo "$HOME/bin" >>$GITHUB_PATH
echo "$HOME/.cargo/bin" >>$GITHUB_PATH

# Exit temporary directory.
popd
