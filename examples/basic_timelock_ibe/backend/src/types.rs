use candid::{CandidType, Principal};
use ic_cdk::api::management_canister::main::CanisterId;
use ic_stable_structures::{storable::Bound, Storable};
use serde::{Deserialize, Serialize};
use serde_bytes::ByteBuf;
use std::borrow::Cow;

pub type LotId = u128;
pub type VetKeyPublicKey = ByteBuf;
pub type BidCounter = u128;

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct EncryptedBid {
    #[serde(with = "serde_bytes")]
    pub encrypted_amount: Vec<u8>,
    pub bidder: Principal,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct DecryptedBid {
    pub amount: u128,
    pub bidder: Principal,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum Bid {
    Encrypted(EncryptedBid),
    Decrypted(DecryptedBid),
}

impl Storable for EncryptedBid {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_cbor::to_vec(self).expect("failed to serialize"))
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_cbor::from_slice(&bytes).expect("failed to deserialize")
    }

    const BOUND: Bound = Bound::Unbounded;
}

impl Storable for DecryptedBid {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_cbor::to_vec(self).expect("failed to serialize"))
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_cbor::from_slice(&bytes).expect("failed to deserialize")
    }

    const BOUND: Bound = Bound::Unbounded;
}

impl Storable for Bid {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_cbor::to_vec(self).expect("failed to serialize"))
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_cbor::from_slice(&bytes).expect("failed to deserialize")
    }

    const BOUND: Bound = Bound::Unbounded;
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct LotInformation {
    pub id: u128,
    pub name: String,
    pub description: String,
    pub start_time: u64,
    pub end_time: u64,
    pub creator: Principal,
    pub status: LotStatus,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub enum LotStatus {
    /// The auction is still open
    Open,
    /// The auction is closed and the winner is the principal in the tuple
    ClosedWithWinner(Principal),
    /// The auction is closed and no bids were made
    ClosedNoBids,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Default)]
pub struct OpenLotsResponse {
    pub lots: Vec<LotInformation>,
    pub bidders: Vec<Vec<Principal>>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Default)]
pub struct ClosedLotsResponse {
    pub lots: Vec<LotInformation>,
    pub bids: Vec<Vec<(Principal, u128)>>,
}

impl Storable for LotInformation {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_cbor::to_vec(self).expect("failed to serialize"))
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_cbor::from_slice(&bytes).expect("failed to deserialize")
    }

    const BOUND: Bound = Bound::Unbounded;
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct SendMessageRequest {
    pub receiver: Principal,
    #[serde(with = "serde_bytes")]
    pub encrypted_message: Vec<u8>,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GetEncryptedIbeKeyRequest {
    #[serde(with = "serde_bytes")]
    pub public_transport_key: Vec<u8>,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum VetKDCurve {
    #[serde(rename = "bls12_381_g2")]
    #[allow(non_camel_case_types)]
    Bls12_381_G2,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub(crate) struct VetKDKeyId {
    pub curve: VetKDCurve,
    pub name: String,
}

#[derive(CandidType, Deserialize)]
pub(crate) struct VetKDPublicKeyRequest {
    pub canister_id: Option<CanisterId>,
    #[serde(with = "serde_bytes")]
    pub context: Vec<u8>,
    pub key_id: VetKDKeyId,
}

#[derive(CandidType, Deserialize)]
pub(crate) struct VetKDPublicKeyReply {
    #[serde(with = "serde_bytes")]
    pub public_key: Vec<u8>,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub(crate) struct VetKDDeriveKeyRequest {
    #[serde(with = "serde_bytes")]
    pub input: Vec<u8>,
    #[serde(with = "serde_bytes")]
    pub context: Vec<u8>,
    #[serde(with = "serde_bytes")]
    pub transport_public_key: Vec<u8>,
    pub key_id: VetKDKeyId,
}

#[derive(CandidType, Deserialize)]
pub(crate) struct VetKDDeriveKeyReply {
    #[serde(with = "serde_bytes")]
    pub encrypted_key: Vec<u8>,
}
