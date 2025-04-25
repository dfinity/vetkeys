use candid::CandidType;
use candid::Deserialize;
use ic_cdk::api::management_canister::main::CanisterId;
use serde_with::serde_as;

#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum VetKDCurve {
    #[serde(rename = "bls12_381")]
    Bls12_381,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct VetKDKeyId {
    pub curve: VetKDCurve,
    pub name: String,
}

#[serde_as]
#[derive(CandidType, Deserialize)]
pub struct VetKDPublicKeyRequest {
    pub canister_id: Option<CanisterId>,
    #[serde_as(as = "Vec<serde_with::Bytes>")]
    pub derivation_path: Vec<Vec<u8>>,
    pub key_id: VetKDKeyId,
}

#[derive(CandidType, Deserialize)]
pub struct VetKDPublicKeyReply {
    #[serde(with = "serde_bytes")]
    pub public_key: Vec<u8>,
}

#[serde_as]
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct VetKDEncryptedKeyRequest {
    #[serde_as(as = "Vec<serde_with::Bytes>")]
    pub public_key_derivation_path: Vec<Vec<u8>>,
    #[serde(with = "serde_bytes")]
    pub derivation_id: Vec<u8>,
    pub key_id: VetKDKeyId,
    #[serde(with = "serde_bytes")]
    pub encryption_public_key: Vec<u8>,
}

#[derive(CandidType, Deserialize)]
pub struct VetKDEncryptedKeyReply {
    #[serde(with = "serde_bytes")]
    pub encrypted_key: Vec<u8>,
}
