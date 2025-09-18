use std::borrow::Cow;

use candid::{CandidType, Principal};
use ic_stable_structures::{storable::Bound, Storable};
use serde::{Deserialize, Serialize};

pub type CanisterId = Principal;

pub type Timestamp = u64;
pub type NftDropEventId = u32;
pub type NftDropId = u64;

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialOrd, Ord, Eq, PartialEq)]
pub struct NftDropEvent {
    pub event_id: NftDropEventId,
    pub title: String,
    pub drops_at: Timestamp,
}

impl Storable for NftDropEvent {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_cbor::to_vec(self).expect("failed to serialize"))
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_cbor::from_slice(&bytes).expect("failed to deserialize")
    }

    const BOUND: Bound = Bound::Unbounded;
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct DropEventEntries {
    pub entries: Vec<Principal>,
}

impl DropEventEntries {
    pub fn new() -> Self {
        Self { entries: vec![] }
    }
}

impl Storable for DropEventEntries {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_cbor::to_vec(self).expect("failed to serialize"))
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_cbor::from_slice(&bytes).expect("failed to deserialize")
    }

    const BOUND: Bound = Bound::Unbounded;
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Ord, PartialOrd, Eq, PartialEq)]
pub struct NftDrop {
    pub event_id: NftDropEventId,
    pub title: String,
    pub nft: Vec<u8>,
}

impl Storable for NftDrop {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_cbor::to_vec(self).expect("failed to serialize"))
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_cbor::from_slice(&bytes).expect("failed to deserialize")
    }

    const BOUND: Bound = Bound::Unbounded;
}
