#!/bin/bash

cd ../../backend && make extract-candid; dfx generate basic_ibe && rm -r ../frontend/src/declarations && mv ../src/declarations ../frontend/src/declarations && rmdir src