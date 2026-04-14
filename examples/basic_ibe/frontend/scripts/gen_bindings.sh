#!/bin/bash

cd ../../rust/backend && make extract-candid

cd ../..

rm -rf frontend/src/declarations/basic_ibe

mkdir -p frontend/src/declarations/basic_ibe
npx @icp-sdk/bindgen --did-file rust/backend/backend.did --out-dir frontend/src/declarations/basic_ibe --declarations-flat --force
