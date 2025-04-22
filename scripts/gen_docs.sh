#! /bin/bash

set -e
cd ..

mkdir -p docs
npm i
npm run make:docs -w frontend/ic_vetkeys
