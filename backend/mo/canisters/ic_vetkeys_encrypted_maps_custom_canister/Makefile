PWD:=$(shell pwd)

# This canister exercises the `EncryptedMapsControlPlaneCanister` mixin. Its
# interface intentionally differs from the standard one (it omits the value
# endpoints and adds custom ones), so it is a compile check rather than being
# run against the shared Rust test harness.
.PHONY: compile-wasm
.SILENT: compile-wasm
compile-wasm:
	mops build
