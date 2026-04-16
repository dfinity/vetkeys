#!/bin/bash

cd ../../backend && make extract-candid

cd .. && dfx generate password_manager_with_metadata || exit 1

rm -r frontend/src/declarations/password_manager_with_metadata > /dev/null 2>&1 || true

mkdir -p frontend/src/declarations/password_manager_with_metadata
mv src/declarations/password_manager_with_metadata frontend/src/declarations
rmdir -p src/declarations > /dev/null 2>&1 || true

# Rewrite @dfinity/* imports to @icp-sdk/core/* in generated declarations
find $(dirname "$0")/../src/declarations -type f \( -name "*.ts" -o -name "*.js" \) -exec \
  perl -i -pe "s|\@dfinity/agent|\@icp-sdk/core/agent|g; s|\@dfinity/principal|\@icp-sdk/core/principal|g; s|\@dfinity/candid|\@icp-sdk/core/candid|g" {} +
