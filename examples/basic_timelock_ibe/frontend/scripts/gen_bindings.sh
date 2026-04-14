#!/bin/bash

cd ../../backend && make extract-candid

cd ..

rm -rf frontend/src/declarations/basic_timelock_ibe

mkdir -p frontend/src/declarations/basic_timelock_ibe
npx @icp-sdk/bindgen --did-file backend/backend.did --out-dir frontend/src/declarations/basic_timelock_ibe --declarations-flat --force
