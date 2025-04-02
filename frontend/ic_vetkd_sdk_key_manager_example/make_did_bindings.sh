set -ex

function make_and_copy_declarations () {
    DIR=$1
    FILENAME=$2

    pushd $DIR
    make extract-candid
    dfx generate
    popd

    mkdir -p declarations
    cp -R "$DIR/src/declarations/key_manager_example" "src/declarations/"
}

make_and_copy_declarations "../../cdk/key_manager_example" "key_manager_example.did";
