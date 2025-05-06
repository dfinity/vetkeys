use candid::CandidType;
use candid::Deserialize;
use ic_cdk::api::management_canister::main::CanisterId;

#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum VetKDCurve {
    #[serde(rename = "bls12_381_g2")]
    #[allow(non_camel_case_types)]
    Bls12_381_G2,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct VetKDKeyId {
    pub curve: VetKDCurve,
    pub name: String,
}

#[derive(CandidType, Deserialize)]
pub struct VetKDPublicKeyRequest {
    pub canister_id: Option<CanisterId>,
    #[serde(with = "serde_bytes")]
    pub context: Vec<u8>,
    pub key_id: VetKDKeyId,
}

#[derive(CandidType, Deserialize)]
pub struct VetKDPublicKeyReply {
    #[serde(with = "serde_bytes")]
    pub public_key: Vec<u8>,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct VetKDEncryptedKeyRequest {
    #[serde(with = "serde_bytes")]
    pub context: Vec<u8>,
    #[serde(with = "serde_bytes")]
    pub input: Vec<u8>,
    pub key_id: VetKDKeyId,
    #[serde(with = "serde_bytes")]
    pub transport_public_key: Vec<u8>,
}

#[derive(CandidType, Deserialize)]
pub struct VetKDEncryptedKeyReply {
    #[serde(with = "serde_bytes")]
    pub encrypted_key: Vec<u8>,
}
