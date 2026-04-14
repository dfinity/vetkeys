#!/bin/bash

# Bindings are always generated from the Rust backend since both backends
# expose the same Candid interface.

# Resolve the physical path of this script so that navigating up works
# correctly even when frontend/ is reached via a symlink (e.g. motoko/frontend).
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
cd "$SCRIPT_DIR/../../rust/backend" && make extract-candid

cd "$SCRIPT_DIR/../.."

rm -rf frontend/src/declarations/encrypted_notes

mkdir -p frontend/src/declarations/encrypted_notes
npx @icp-sdk/bindgen --did-file rust/backend/src/encrypted_notes_rust.did --out-dir frontend/src/declarations/encrypted_notes --declarations-flat --force
