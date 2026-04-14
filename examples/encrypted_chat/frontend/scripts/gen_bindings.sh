#!/bin/bash
# Bindings are always generated from the Rust backend since both backends
# expose the same Candid interface.

# Resolve the physical path of this script so that navigating up works
# correctly even when frontend/ is reached via a symlink (e.g. motoko/frontend).
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
cd "$SCRIPT_DIR/../../rust/backend" && make extract-candid

cd "$SCRIPT_DIR/../.."
rm -rf frontend/src/declarations/encrypted_chat
mkdir -p frontend/src/declarations/encrypted_chat
npx @icp-sdk/bindgen --did-file rust/backend/backend.did \
    --out-dir frontend/src/declarations/encrypted_chat \
    --declarations-flat --force
