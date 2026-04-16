#!/bin/bash

cd ../../backend && make extract-candid

cd .. && dfx generate basic_bls_signing || exit 1

rm -r frontend/src/declarations/basic_bls_signing > /dev/null 2>&1 || true

mkdir -p frontend/src/declarations/basic_bls_signing
mv src/declarations/basic_bls_signing frontend/src/declarations
rmdir -p src/declarations > /dev/null 2>&1 || true

# Rewrite @dfinity/* imports to @icp-sdk/core/* in generated declarations
find $(dirname "$0")/../src/declarations -type f \( -name "*.ts" -o -name "*.js" \) -exec \
  perl -i -pe "s|\@dfinity/agent|\@icp-sdk/core/agent|g; s|\@dfinity/principal|\@icp-sdk/core/principal|g; s|\@dfinity/candid|\@icp-sdk/core/candid|g" {} +
