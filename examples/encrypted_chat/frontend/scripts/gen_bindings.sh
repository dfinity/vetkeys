#!/bin/bash

cd ../../backend && make extract-candid

cd .. && dfx generate encrypted_chat || exit 1

rm -r frontend/src/declarations/encrypted_chat > /dev/null 2>&1 || true

mkdir -p frontend/src/declarations/encrypted_chat
mv src/declarations/encrypted_chat frontend/src/declarations
rmdir -p src/declarations > /dev/null 2>&1 || true

# Rewrite @dfinity/* imports to @icp-sdk/core/* in generated declarations
find frontend/src/declarations -type f \( -name '*.ts' -o -name '*.js' \) -exec sed -i '' \
  -e 's|@dfinity/agent|@icp-sdk/core/agent|g' \
  -e 's|@dfinity/principal|@icp-sdk/core/principal|g' \
  -e 's|@dfinity/candid|@icp-sdk/core/candid|g' \
  {} +