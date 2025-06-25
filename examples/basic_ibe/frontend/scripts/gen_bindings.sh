#!/bin/bash

cd ../../backend && make extract-candid

dfx generate basic_ibe || exit 1

rm -r ../frontend/src/declarations/basic_ibe > /dev/null 2>&1 || true

mv ../src/declarations/basic_ibe ../frontend/src/declarations/basic_ibe
rmdir -p ../src/declarations > /dev/null 2>&1 || true