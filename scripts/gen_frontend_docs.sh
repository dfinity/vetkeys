#! /bin/bash

set -e

pnpm install
pnpm --filter @icp-sdk/vetkeys run make:docs
