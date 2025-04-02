set -ex

function make_and_copy_declarations () {
    DIR=$1
    NAME=$2

    pushd $DIR
    make extract-candid
    dfx generate
    popd

    mkdir -p declarations
    mv "$DIR/""$NAME""/src/declarations/""$NAME" "src/declarations/"
}

make_and_copy_declarations "../../backend/canisters/" "ic_vetkeys_manager_canister"
make_and_copy_declarations "../../backend/canisters/" "ic_vetkeys_encrypted_maps_canister"
