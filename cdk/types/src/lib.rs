use std::{borrow::Cow, convert::TryInto};

use candid::{CandidType, Decode, Encode};
use ic_stable_structures::{
    storable::{Blob, Bound},
    Storable,
};
use serde::Deserialize;

pub type KeyName = Blob<32>;
pub type MapName = KeyName;
pub type MapKey = Blob<32>;
pub type TransportKey = ByteBuf;
pub type EncryptedMapValue = ByteBuf;

#[repr(u8)]
#[derive(
    CandidType,
    Deserialize,
    Clone,
    Copy,
    PartialEq,
    PartialOrd,
    Debug,
    strum_macros::FromRepr,
    strum_macros::EnumIter,
)]
pub enum AccessRights {
    Read = 0,
    ReadWrite = 1,
    ReadWriteManage = 2,
}

impl Storable for AccessRights {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(vec![*self as u8])
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let v = <u8>::from_be_bytes(bytes.as_ref().try_into().unwrap());
        Self::from_repr(v).unwrap()
    }

    const BOUND: Bound = Bound::Bounded {
        max_size: 1,
        is_fixed_size: true,
    };
}

#[derive(CandidType, Deserialize, PartialEq, Eq, PartialOrd, Ord, Clone, Debug)]
pub struct ByteBuf {
    #[serde(with = "serde_bytes")]
    inner: Vec<u8>,
}

impl ByteBuf {
    pub fn new() -> Self {
        Self { inner: Vec::new() }
    }
}

impl From<Vec<u8>> for ByteBuf {
    fn from(inner: Vec<u8>) -> Self {
        Self { inner }
    }
}

impl From<ByteBuf> for Vec<u8> {
    fn from(buf: ByteBuf) -> Self {
        buf.inner
    }
}

impl AsRef<[u8]> for ByteBuf {
    fn as_ref(&self) -> &[u8] {
        &self.inner
    }
}

impl Default for ByteBuf {
    fn default() -> Self {
        Self::new()
    }
}

impl Storable for ByteBuf {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(Encode!(self).unwrap())
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        Decode!(bytes.as_ref(), Self).unwrap()
    }
    const BOUND: Bound = Bound::Unbounded;
}
