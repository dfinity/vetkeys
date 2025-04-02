set -ex

function make_and_copy_declarations () {
    DIR=$1

    pushd $DIR
    make extract-candid
    dfx generate
    popd

    mkdir -p declarations
    cp -R "$DIR/src/declarations/encrypted_maps_example" "src/declarations/"
}

make_and_copy_declarations "../../cdk/encrypted_maps_example"
