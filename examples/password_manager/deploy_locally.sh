pushd ../../cdk/encrypted_maps_example
    make clean &&
    make mock &&
    eval $(make export-cmd)
popd

dfx deps pull && dfx deps init && dfx deps deploy &&
export INTERNET_IDENTITY_CANISTER_ID=rdmx6-jaaaa-aaaaa-aaadq-cai
