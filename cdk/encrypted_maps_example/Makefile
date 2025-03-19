.PHONY: compile-wasm
.SILENT: compile-wasm
compile-wasm:
	cargo build --release --target wasm32-unknown-unknown

.PHONY: extract-candid
.SILENT: extract-candid
extract-candid: compile-wasm
	candid-extractor ../../target/wasm32-unknown-unknown/release/ic_vetkd_cdk_encrypted_maps_example.wasm > encrypted_maps_example.did

.PHONY: compile-wasm-test
.SILENT: compile-wasm-test
compile-wasm-test:
	cargo build --release --target wasm32-unknown-unknown --features expose-testing-api

.PHONY: deploy-test
.SILENT: deploy-test
deploy-test: compile-wasm-test
	dfx canister create chainkey_testing_canister && \
	dfx canister create encrypted_maps_example && \
	dfx build chainkey_testing_canister && \
	dfx canister install --upgrade-unchanged --mode auto chainkey_testing_canister && \
	dfx canister install --upgrade-unchanged --mode auto --wasm ../../target/wasm32-unknown-unknown/release/ic_vetkd_cdk_encrypted_maps_example.wasm encrypted_maps_example

.PHONY: mock
.SILENT: mock
mock: deploy-test
	VETKD_MOCK_CANISTER_ID=$(shell dfx canister id chainkey_testing_canister); \
	echo "Changing to using mock canister instead of management canister for vetkd to "$${VETKD_MOCK_CANISTER_ID}""; \
    CMD="dfx canister call encrypted_maps_example set_vetkd_testing_canister_id '(principal "\"$${VETKD_MOCK_CANISTER_ID}\"")'"; \
	eval "$${CMD}"

.PHONY: export-cmd
.SILENT: export-cmd
export-cmd:
	CANISTER_ID_ENCRYPTED_MAPS_EXAMPLE=$(shell dfx canister id encrypted_maps_example); \
	CMD="export CANISTER_ID_ENCRYPTED_MAPS_EXAMPLE=$${CANISTER_ID_ENCRYPTED_MAPS_EXAMPLE}"; \
	echo "$${CMD}"

.PHONY: clean
.SILENT: clean
clean:
	cargo clean
	rm -rf .dfx