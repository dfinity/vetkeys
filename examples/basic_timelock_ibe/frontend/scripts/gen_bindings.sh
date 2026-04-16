#!/bin/bash

cd ../../backend && make extract-candid && dfx generate basic_timelock_ibe && cd ../frontend && rm -r ./src/declarations >> /dev/null 2>&1
mv ../src/declarations ./src && rmdir ../src

# Rewrite @dfinity/* imports to @icp-sdk/core/* in generated declarations
find ./src/declarations -type f \( -name "*.ts" -o -name "*.js" \) -exec \
  perl -i -pe 's|\@dfinity/agent|\@icp-sdk/core/agent|g; s|\@dfinity/principal|\@icp-sdk/core/principal|g; s|\@dfinity/candid|\@icp-sdk/core/candid|g' {} +
