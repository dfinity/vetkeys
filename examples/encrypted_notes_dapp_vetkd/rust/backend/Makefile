.PHONY: compile-wasm
.SILENT: compile-wasm
compile-wasm:
	cargo build --release --target wasm32-unknown-unknown

.PHONY: extract-candid
.SILENT: extract-candid
extract-candid: compile-wasm
	candid-extractor ../target/wasm32-unknown-unknown/release/encrypted_notes_backend.wasm > src/encrypted_notes_rust.did

.PHONY: clean
.SILENT: clean
clean:
	cargo clean
