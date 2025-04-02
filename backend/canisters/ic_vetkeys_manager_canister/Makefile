.PHONY: compile-wasm
.SILENT: compile-wasm
compile-wasm:
	cargo build --release --target wasm32-unknown-unknown

.PHONY: extract-candid
.SILENT: extract-candid
extract-candid: compile-wasm
	candid-extractor ../../target/wasm32-unknown-unknown/release/ic_vetkd_cdk_key_manager_example.wasm > key_manager_example.did

.PHONY: compile-wasm-test
.SILENT: compile-wasm-test
compile-wasm-test:
	cargo build --release --target wasm32-unknown-unknown --features expose-testing-api

.PHONY: deploy-test
.SILENT: deploy-test
deploy-test: compile-wasm-test
	dfx canister create chainkey_testing_canister && \
	dfx canister create key_manager_example && \
	dfx build chainkey_testing_canister && \
	dfx canister install chainkey_testing_canister && \
	dfx canister install --wasm ../../target/wasm32-unknown-unknown/release/ic_vetkd_cdk_key_manager_example.wasm key_manager_example

.PHONY: mock
.SILENT: mock
mock: deploy-test
	SCHNORR_MOCK_CANISTER_ID=$(shell dfx canister id chainkey_testing_canister); \
	echo "Changing to using mock canister instead of management canister for vetkd to "$${SCHNORR_MOCK_CANISTER_ID}""; \
    CMD="dfx canister call key_manager_example set_vetkd_testing_canister_id '(principal "\"$${SCHNORR_MOCK_CANISTER_ID}\"")'"; \
	eval "$${CMD}"

.PHONY: export-cmd
.SILENT: export-cmd
export-cmd:
	CANISTER_ID_KEY_MANAGER_EXAMPLE=$(shell dfx canister id key_manager_example); \
	CMD="export CANISTER_ID_KEY_MANAGER_EXAMPLE=$${CANISTER_ID_KEY_MANAGER_EXAMPLE}"; \
	echo "$${CMD}"
