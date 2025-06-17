pub mod types;
use candid::Principal;
use ic_cdk::management_canister::{VetKDCurve, VetKDKeyId, VetKDPublicKeyArgs};
use ic_cdk::{query, update};
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    DefaultMemoryImpl, StableLog,
};
use serde_bytes::ByteBuf;
use std::cell::RefCell;
use types::Signature;

type Memory = VirtualMemory<DefaultMemoryImpl>;

type VetKeyPublicKey = ByteBuf;
type RawSignature = ByteBuf;
type RawMessage = String;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    static PUBLISHED_SIGNATURES: RefCell<StableLog<Signature, Memory, Memory>> = RefCell::new(StableLog::new(
        MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))), // index memory
        MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(1))), // data memory
    ));

    static CANISTER_PUBLIC_KEY: RefCell<Option<VetKeyPublicKey>> =  const { RefCell::new(None) };
}

#[update]
async fn sign_message(message: RawMessage) -> RawSignature {
    let signature = ic_vetkeys::management_canister::sign_with_bls(
        message.as_bytes().to_vec(),
        get_context(ic_cdk::api::msg_caller()),
        bls12_381_dfx_test_key(),
    )
    .await
    .expect("ic_vetkeys' sign_with_bls failed");

    signature.into()
}

#[update]
fn publish_my_signature_no_verification(message: RawMessage, signature: RawSignature) {
    let signature = Signature {
        message,
        signature: signature.into_vec(),
        timestamp: ic_cdk::api::time(),
        signer: ic_cdk::api::msg_caller(),
    };
    PUBLISHED_SIGNATURES
        .with_borrow_mut(|log| log.append(&signature))
        .expect("Failed to append signature to log");
}

#[query]
fn get_published_signatures() -> Vec<Signature> {
    PUBLISHED_SIGNATURES.with_borrow(|log| log.iter().collect())
}

#[update]
async fn get_canister_public_key() -> VetKeyPublicKey {
    match CANISTER_PUBLIC_KEY.with(|v| v.borrow().to_owned()) {
        Some(root_ibe_public_key) => root_ibe_public_key,
        None => {
            let request = VetKDPublicKeyArgs {
                canister_id: None,
                context: vec![],
                key_id: bls12_381_dfx_test_key(),
            };

            let result = ic_cdk::management_canister::vetkd_public_key(&request)
                .await
                .expect("call to vetkd_public_key failed");

            result.public_key.into()
        }
    }
}

fn get_context(signer: Principal) -> Vec<u8> {
    // A domain separator is not strictly necessary in this dapp, but having one is considered a good practice.
    const DOMAIN_SEPARATOR: [u8; 22] = *b"basic_bls_signing_dapp";
    const DOMAIN_SEPARATOR_LENGTH: u8 = DOMAIN_SEPARATOR.len() as u8;
    [DOMAIN_SEPARATOR_LENGTH]
        .into_iter()
        .chain(DOMAIN_SEPARATOR)
        .chain(signer.as_ref().iter().cloned())
        .collect()
}

fn bls12_381_dfx_test_key() -> VetKDKeyId {
    VetKDKeyId {
        curve: VetKDCurve::Bls12_381_G2,
        name: "dfx_test_key".to_string(),
    }
}

// In the following, we register a custom getrandom implementation because
// otherwise getrandom (which is a dependency of some other dependencies) fails to compile.
// This is necessary because getrandom by default fails to compile for the
// wasm32-unknown-unknown target (which is required for deploying a canister).
// Our custom implementation always fails, which is sufficient here because
// the used RNGs are _manually_ seeded rather than by the system.
#[cfg(all(
    target_arch = "wasm32",
    target_vendor = "unknown",
    target_os = "unknown"
))]
getrandom::register_custom_getrandom!(always_fail);
#[cfg(all(
    target_arch = "wasm32",
    target_vendor = "unknown",
    target_os = "unknown"
))]
fn always_fail(_buf: &mut [u8]) -> Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED)
}

ic_cdk::export_candid!();
