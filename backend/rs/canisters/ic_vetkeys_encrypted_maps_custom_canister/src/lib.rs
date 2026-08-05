// Reference canister for the `custom_value_endpoints` form of
// `export_encrypted_maps_canister!`. It generates the control-plane endpoints
// plus the state, lifecycle hooks, and the `with_encrypted_maps`/`_mut`
// accessors, but NOT the value read/write endpoints — the canister exposes its
// own. This is the pattern an app uses when it keeps state linked to each value
// (e.g. a metadata row per entry) and must own the value endpoints to keep that
// state consistent.
//
// This minimal example just re-implements a plain insert/get against the
// accessor to exercise the surface; a full linked-metadata example lives in
// `password_manager_with_metadata` in dfinity/examples.
use candid::Principal;
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::storable::Blob;
use ic_stable_structures::DefaultMemoryImpl;
use ic_vetkeys::types::{ByteBuf, EncryptedMapValue};
use std::cell::RefCell;

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
}

fn memory(id: u8) -> Memory {
    MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(id)))
}

// Control plane + state + lifecycle + accessors; no value endpoints.
ic_vetkeys::export_encrypted_maps_canister!(
    "encrypted_maps_custom_app",
    [memory(0), memory(1), memory(2), memory(3)],
    custom_value_endpoints,
);

fn to_blob(bytes: ByteBuf) -> Result<Blob<32>, String> {
    Blob::try_from(bytes.as_ref()).map_err(|_| "too large input".to_string())
}

// A canister-owned value write, wrapping the library's own via the accessor.
// This is where linked side-state (metadata, counters, …) would be maintained
// in the same call — kept minimal here.
//
// Parameters (matching the EncryptedMaps model):
// - `map_owner`: the principal that owns the map; together with `map_name` it
//   identifies the map. Maps are namespaced per owner.
// - `map_name`: the map's name within the owner's namespace (max 32 bytes).
// - `map_key`: the key of the entry within that map (max 32 bytes).
// - `value`: the already client-side-encrypted value to store.
// Returns the previous value at that key, if any. Access is checked against the
// caller (`msg_caller`) by the library.
#[ic_cdk::update]
fn insert_encrypted_value_custom(
    map_owner: Principal,
    map_name: ByteBuf,
    map_key: ByteBuf,
    value: EncryptedMapValue,
) -> Result<Option<EncryptedMapValue>, String> {
    with_encrypted_maps_mut(|encrypted_maps| {
        encrypted_maps.insert_encrypted_value(
            ic_cdk::api::msg_caller(),
            (map_owner, to_blob(map_name)?),
            to_blob(map_key)?,
            value,
        )
    })
}

// A canister-owned value read via the shared-reference accessor.
//
// `map_owner` + `map_name` identify the map, `map_key` the entry within it (see
// `insert_encrypted_value_custom`). Returns the encrypted value at that key, if
// any; access is checked against the caller by the library.
#[ic_cdk::query]
fn get_encrypted_value_custom(
    map_owner: Principal,
    map_name: ByteBuf,
    map_key: ByteBuf,
) -> Result<Option<EncryptedMapValue>, String> {
    with_encrypted_maps(|encrypted_maps| {
        encrypted_maps.get_encrypted_value(
            ic_cdk::api::msg_caller(),
            (map_owner, to_blob(map_name)?),
            to_blob(map_key)?,
        )
    })
}

ic_cdk::export_candid!();
