set -ex

# Pin the bindgen version so regeneration is reproducible. The committed
# declarations under src/declarations were generated with this version; the
# interface-sync CI guard regenerates and diffs against them, so an unpinned
# version (whatever `npx` resolves to) would cause spurious failures whenever a
# newer bindgen ships cosmetic/formatting changes. Bump this deliberately and
# commit the regenerated output together.
BINDGEN_VERSION="0.3.0"

# Set SKIP_EXTRACT_CANDID=1 to regenerate the TS declarations from the existing
# committed .did files without rebuilding them from the Rust source. The
# interface-sync CI guard uses this so the check stays reproducible (it depends
# only on the pinned bindgen version and the committed .did, not on the
# candid-extractor / wasm toolchain).
SKIP_EXTRACT_CANDID="${SKIP_EXTRACT_CANDID:-0}"

function make_and_copy_declarations () {
    DIR=$1
    NAME=$2
    DID_FILE=$3

    if [ "$SKIP_EXTRACT_CANDID" != "1" ]; then
        pushd "$DIR/$NAME"
        make extract-candid
        popd
    fi

    rm -rf "src/declarations/$NAME"
    mkdir -p "src/declarations/$NAME"
    npx "@icp-sdk/bindgen@${BINDGEN_VERSION}" --did-file "$DIR/$NAME/$DID_FILE" --out-dir "src/declarations/$NAME" --declarations-flat --force
}

make_and_copy_declarations "../../backend/rs/canisters/" "ic_vetkeys_manager_canister" "ic_vetkeys_manager_canister.did"
make_and_copy_declarations "../../backend/rs/canisters/" "ic_vetkeys_encrypted_maps_canister" "ic_vetkeys_encrypted_maps_canister.did"
