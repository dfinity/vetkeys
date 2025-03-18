use std::cell::RefCell;

use candid::Principal;
use ic_cdk::{query, update};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::storable::Blob;
use ic_stable_structures::DefaultMemoryImpl;
use ic_vetkd_cdk_key_manager::{KeyManager, VetKey, VetKeyVerificationKey};
use ic_vetkd_cdk_types::{AccessRights, ByteBuf, TransportKey};

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
    static KEY_MANAGER: RefCell<KeyManager> = RefCell::new(KeyManager::init("key_manager", id_to_memory(0), id_to_memory(1), id_to_memory(2)));
}

#[query]
fn get_accessible_shared_key_ids() -> Vec<(Principal, ByteBuf)> {
    KEY_MANAGER.with_borrow(|km| {
        km.get_accessible_shared_key_ids(ic_cdk::caller())
            .into_iter()
            .map(|key_id| (key_id.0, ByteBuf::from(key_id.1.as_ref().to_vec())))
            .collect()
    })
}

#[query]
fn get_shared_user_access_for_key(
    key_owner: Principal,
    key_name: ByteBuf,
) -> Result<Vec<(Principal, AccessRights)>, String> {
    let key_name = bytebuf_to_blob(key_name)?;
    let key_id = (key_owner, key_name);
    KEY_MANAGER.with_borrow(|km| km.get_shared_user_access_for_key(ic_cdk::caller(), key_id))
}

#[update]
async fn get_vetkey_verification_key() -> VetKeyVerificationKey {
    KEY_MANAGER
        .with_borrow(|km| km.get_vetkey_verification_key())
        .await
}

#[update]
async fn get_encrypted_vetkey(
    key_owner: Principal,
    key_name: ByteBuf,
    transport_key: TransportKey,
) -> Result<VetKey, String> {
    let key_name = bytebuf_to_blob(key_name)?;
    let key_id = (key_owner, key_name);
    Ok(KEY_MANAGER
        .with_borrow(|km| km.get_encrypted_vetkey(ic_cdk::caller(), key_id, transport_key))?
        .await)
}

#[query]
fn get_user_rights(
    key_owner: Principal,
    key_name: ByteBuf,
    user: Principal,
) -> Result<Option<AccessRights>, String> {
    let key_name = bytebuf_to_blob(key_name)?;
    let key_id = (key_owner, key_name);
    KEY_MANAGER.with_borrow(|km| km.get_user_rights(ic_cdk::caller(), key_id, user))
}

#[update]
fn set_user_rights(
    key_owner: Principal,
    key_name: ByteBuf,
    user: Principal,
    access_rights: AccessRights,
) -> Result<Option<AccessRights>, String> {
    let key_name = bytebuf_to_blob(key_name)?;
    let key_id = (key_owner, key_name);
    KEY_MANAGER
        .with_borrow_mut(|km| km.set_user_rights(ic_cdk::caller(), key_id, user, access_rights))
}

#[update]
fn remove_user(
    key_owner: Principal,
    key_name: ByteBuf,
    user: Principal,
) -> Result<Option<AccessRights>, String> {
    let key_name = bytebuf_to_blob(key_name)?;
    let key_id = (key_owner, key_name);
    KEY_MANAGER.with_borrow_mut(|km| km.remove_user(ic_cdk::caller(), key_id, user))
}

#[cfg(feature = "expose-testing-api")]
#[update]
fn set_vetkd_testing_canister_id(vetkd_testing_canister: Principal) {
    ic_vetkd_cdk_key_manager::set_vetkd_testing_canister_id(vetkd_testing_canister)
}

fn bytebuf_to_blob(buf: ByteBuf) -> Result<Blob<32>, String> {
    Blob::try_from(buf.as_ref()).map_err(|_| "too large input".to_string())
}

fn id_to_memory(id: u8) -> Memory {
    MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(id)))
}

ic_cdk::export_candid!();
