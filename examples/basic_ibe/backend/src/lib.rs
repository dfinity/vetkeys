use candid::Principal;
use ic_cdk::api::management_canister::provisional::CanisterId;
use ic_cdk::{query, update};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::{BTreeMap as StableBTreeMap, DefaultMemoryImpl};
use serde_bytes::ByteBuf;
use std::cell::RefCell;
use std::str::FromStr;

mod types;
use types::*;

type Memory = VirtualMemory<DefaultMemoryImpl>;
type EncryptedVetKey = ByteBuf;
type VetKeyPublicKey = ByteBuf;
type TransportPublicKey = ByteBuf;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
    static INBOXES: RefCell<StableBTreeMap<Principal, Inbox, Memory>> = RefCell::new(StableBTreeMap::init(
        MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
    ));
}

static DOMAIN_SEPARATOR: &str = "basic_ibe_example_dapp";
const CANISTER_ID_VETKD_SYSTEM_API: &str = "aaaaa-aa";

#[update]
fn send_message(request: SendMessageRequest) -> Result<(), String> {
    let sender = ic_cdk::caller();
    let SendMessageRequest {
        receiver,
        encrypted_message,
    } = request;
    let timestamp = ic_cdk::api::time();

    let message = Message {
        sender,
        encrypted_message,
        timestamp,
    };

    INBOXES.with_borrow_mut(|inboxes| {
        let mut inbox = inboxes.get(&receiver).unwrap_or_default();

        if inbox.messages.len() >= MAX_MESSAGES_PER_INBOX {
            Err(format!("Inbox for {} is full", receiver))
        } else {
            inbox.messages.push(message);
            inboxes.insert(receiver, inbox);
            Ok(())
        }
    })
}

#[update]
async fn get_root_ibe_public_key() -> VetKeyPublicKey {
    let request = VetKDPublicKeyRequest {
        canister_id: None,
        context: DOMAIN_SEPARATOR.as_bytes().to_vec(),
        key_id: bls12_381_dfx_test_key(),
    };

    let (result,) = ic_cdk::api::call::call::<_, (VetKDPublicKeyReply,)>(
        vetkd_system_api_canister_id(),
        "vetkd_public_key",
        (request,),
    )
    .await
    .expect("call to vetkd_public_key failed");

    VetKeyPublicKey::from(result.public_key)
}

#[update]
/// Retrieves the caller's encrypted private IBE key for message decryption.
async fn get_my_encrypted_ibe_key(transport_key: TransportPublicKey) -> EncryptedVetKey {
    let caller = ic_cdk::caller();
    let request = VetKDDeriveKeyRequest {
        input: caller.as_ref().to_vec(),
        context: DOMAIN_SEPARATOR.as_bytes().to_vec(),
        key_id: bls12_381_dfx_test_key(),
        transport_public_key: transport_key.into_vec(),
    };

    let (result,) = ic_cdk::api::call::call_with_payment128::<_, (VetKDDeriveKeyReply,)>(
        vetkd_system_api_canister_id(),
        "vetkd_derive_key",
        (request,),
        26_153_846_153,
    )
    .await
    .expect("call to vetkd_derive_key failed");

    EncryptedVetKey::from(result.encrypted_key)
}

#[query]
fn get_my_messages() -> Inbox {
    let caller = ic_cdk::caller();
    INBOXES.with_borrow(|inboxes| inboxes.get(&caller).unwrap_or_default())
}

#[update]
fn remove_my_message_by_index(message_index: usize) -> Result<(), String> {
    let caller = ic_cdk::caller();
    INBOXES.with_borrow_mut(|inboxes| {
        let mut inbox = inboxes.get(&caller).unwrap_or_default();
        if message_index >= inbox.messages.len() {
            Err("Message index out of bounds".to_string())
        } else {
            inbox.messages.remove(message_index);
            inboxes.insert(caller, inbox);
            Ok(())
        }
    })
}

fn bls12_381_dfx_test_key() -> VetKDKeyId {
    VetKDKeyId {
        curve: VetKDCurve::Bls12_381_G2,
        name: "dfx_test_key".to_string(),
    }
}

fn vetkd_system_api_canister_id() -> CanisterId {
    CanisterId::from_str(CANISTER_ID_VETKD_SYSTEM_API).expect("failed to create canister ID")
}

ic_cdk::export_candid!();
