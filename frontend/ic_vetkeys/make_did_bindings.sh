set -ex

function make_and_copy_declarations () {
    DIR=$1
    NAME=$2
    DID_FILE=$3

    pushd "$DIR/$NAME"
    make extract-candid
    popd

    rm -rf "src/declarations/$NAME"
    mkdir -p "src/declarations/$NAME"
    npx @icp-sdk/bindgen --did-file "$DIR/$NAME/$DID_FILE" --out-dir "src/declarations/$NAME" --declarations-flat --force
}

make_and_copy_declarations "../../backend/rs/canisters/" "ic_vetkeys_manager_canister" "ic_vetkeys_manager_canister.did"
make_and_copy_declarations "../../backend/rs/canisters/" "ic_vetkeys_encrypted_maps_canister" "ic_vetkeys_encrypted_maps_canister.did"
