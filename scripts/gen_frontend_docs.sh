#! /bin/bash

set -e

npm i
npm run make:docs -w frontend/ic_vetkeys
