ROOT_DIR := $(shell git rev-parse --show-toplevel)

.PHONY: compile-wasm
.SILENT: compile-wasm
compile-wasm:
	cargo build --release --target wasm32-unknown-unknown

.PHONY: extract-candid
.SILENT: extract-candid
extract-candid: compile-wasm
	candid-extractor $(ROOT_DIR)/target/wasm32-unknown-unknown/release/ic_vetkeys_manager_canister.wasm > ic_vetkeys_manager_canister.did

.PHONY: export-cmd
.SILENT: export-cmd
export-cmd:
	CANISTER_ID_IC_VETKEYS_MANAGER_CANISTER=$(shell dfx canister id ic_vetkeys_manager_canister); \
	CMD="export CANISTER_ID_IC_VETKEYS_MANAGER_CANISTER=$${CANISTER_ID_IC_VETKEYS_MANAGER_CANISTER}"; \
	echo "$${CMD}"
