#!/bin/bash

cd ../.. && dfx generate encrypted_notes || exit 1

rm -r frontend/src/declarations/encrypted_notes > /dev/null 2>&1 || true

mkdir -p frontend/src/declarations/encrypted_notes
mv src/declarations/encrypted_notes frontend/src/declarations
rmdir -p src/declarations > /dev/null 2>&1 || true

# Rewrite @dfinity/* imports to @icp-sdk/core/* in generated declarations
find frontend/src/declarations -type f \( -name "*.ts" -o -name "*.js" \) -exec \
  perl -i -pe 's|\@dfinity/agent|\@icp-sdk/core/agent|g; s|\@dfinity/principal|\@icp-sdk/core/principal|g; s|\@dfinity/candid|\@icp-sdk/core/candid|g' {} +
