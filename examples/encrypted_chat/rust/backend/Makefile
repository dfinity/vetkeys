.PHONY: compile-wasm
.SILENT: compile-wasm
compile-wasm:
	cargo build --release --target wasm32-unknown-unknown

.PHONY: extract-candid
.SILENT: extract-candid
extract-candid: compile-wasm
	candid-extractor ../target/wasm32-unknown-unknown/release/ic-vetkeys-example-encrypted-chat-backend.wasm > backend.did

.PHONY: clean
.SILENT: clean
clean:
	cargo clean
	rm -rf ../.dfx