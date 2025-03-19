//! Types for V1 encrypted maps. V1 uses one vetkey per map that each authorized
//! user can access. The encryption keys for the map-keys are derived from the
//! vetkey hash.
//! APIs for V1 encrypted maps. V1 uses one vetkey per map that each authorized
//! user can access. The encryption keys for the map-keys are derived from the
//! vetkey hash.

use candid::Principal;
use ic_stable_structures::memory_manager::VirtualMemory;
use ic_stable_structures::storable::Blob;
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap};
use std::cell::RefCell;
use std::future::Future;

use ic_vetkd_cdk_key_manager::KeyId;
use ic_vetkd_cdk_types::{
    AccessRights, ByteBuf, EncryptedMapValue, MapId, MapKey, MapName, TransportKey,
};

// On a high level,
// `ENCRYPTED_MAPS[MapName][MapKey] = EncryptedMapValue`, e.g.
// `ENCRYPTED_MAPS[b"alex's map".into()][b"github API token".into()] = b"secret-api-token-to-be-encrypted".into()`.

pub type VetKeyVerificationKey = ByteBuf;
pub type VetKey = ByteBuf;

thread_local! {
    static ENCRYPTED_MAPS: RefCell<Option<EncryptedMaps>> = const { RefCell::new(None) };
}

type Memory = VirtualMemory<DefaultMemoryImpl>;

pub struct EncryptedMaps {
    pub key_manager: ic_vetkd_cdk_key_manager::KeyManager,
    pub mapkey_vals: StableBTreeMap<(KeyId, MapKey), EncryptedMapValue, Memory>,
}

impl EncryptedMaps {
    pub fn init(
        domain_separator: &str,
        memory_domain_separator: Memory,
        memory_access_control: Memory,
        memory_shared_keys: Memory,
        memory_encrypted_maps: Memory,
    ) -> Self {
        let key_manager = ic_vetkd_cdk_key_manager::KeyManager::init(
            domain_separator,
            memory_domain_separator,
            memory_access_control,
            memory_shared_keys,
        );

        let mapkey_vals = StableBTreeMap::init(memory_encrypted_maps);

        Self {
            key_manager,
            mapkey_vals,
        }
    }

    pub fn get_accessible_shared_map_names(&self, caller: Principal) -> Vec<KeyId> {
        self.key_manager.get_accessible_shared_key_ids(caller)
    }

    pub fn get_shared_user_access_for_map(
        &self,
        caller: Principal,
        key_id: KeyId,
    ) -> Result<Vec<(Principal, AccessRights)>, String> {
        self.key_manager
            .get_shared_user_access_for_key(caller, key_id)
    }

    pub fn remove_map_values(
        &mut self,
        caller: Principal,
        key_id: KeyId,
    ) -> Result<Vec<MapKey>, String> {
        match self.key_manager.get_user_rights(caller, key_id, caller)? {
            Some(AccessRights::ReadWrite) | Some(AccessRights::ReadWriteManage) => Ok(()),
            Some(AccessRights::Read) | None => Err("unauthorized user".to_string()),
        }?;

        let keys: Vec<_> = self
            .mapkey_vals
            .range((key_id, Blob::default())..)
            .take_while(|((k, _), _)| k == &key_id)
            .map(|((_name, key), _value)| key)
            .collect();

        for key in keys.iter() {
            self.mapkey_vals.remove(&(key_id, *key));
        }

        Ok(keys)
    }

    pub fn get_encrypted_values_for_map(
        &self,
        caller: Principal,
        key_id: KeyId,
    ) -> Result<Vec<(MapKey, EncryptedMapValue)>, String> {
        match self.key_manager.get_user_rights(caller, key_id, caller)? {
            Some(_) => Ok(()),
            None => Err("unauthorized user".to_string()),
        }?;

        Ok(self
            .mapkey_vals
            .range((key_id, Blob::default())..)
            .take_while(|((k, _), _)| k == &key_id)
            .map(|((_, k), v)| (k, v))
            .collect())
    }

    pub fn get_encrypted_value(
        &self,
        caller: Principal,
        key_id: KeyId,
        key: MapKey,
    ) -> Result<Option<EncryptedMapValue>, String> {
        match self.key_manager.get_user_rights(caller, key_id, caller)? {
            Some(_) => Ok(()),
            None => Err("unauthorized user".to_string()),
        }?;

        Ok(self.mapkey_vals.get(&(key_id, key)))
    }

    pub fn get_all_accessible_encrypted_values(
        &self,
        caller: Principal,
    ) -> Vec<(MapId, Vec<(MapKey, EncryptedMapValue)>)> {
        let mut result = Vec::new();
        for map_id in self.get_accessible_map_ids_iter(caller) {
            let map_values = self.get_encrypted_values_for_map(caller, map_id).unwrap();
            result.push((map_id, map_values));
        }
        result
    }

    pub fn get_all_accessible_encrypted_maps(&self, caller: Principal) -> Vec<EncryptedMapData> {
        let mut result = Vec::new();
        for map_id in self.get_accessible_map_ids_iter(caller) {
            let keyvals = self
                .get_encrypted_values_for_map(caller, map_id)
                .unwrap()
                .into_iter()
                .map(|(key, value)| (ByteBuf::from(key.as_ref().to_vec()), value))
                .collect();
            let map = EncryptedMapData {
                map_owner: map_id.0,
                map_name: ByteBuf::from(map_id.1.as_ref().to_vec()),
                keyvals,
                access_control: self.get_shared_user_access_for_map(caller, map_id).unwrap(),
            };
            result.push(map);
        }
        result
    }

    fn get_accessible_map_ids_iter(
        &self,
        caller: Principal,
    ) -> impl Iterator<Item = (Principal, MapName)> {
        let accessible_map_ids = self.get_accessible_shared_map_names(caller).into_iter();
        let owned_map_ids =
            std::iter::repeat(caller).zip(self.get_owned_non_empty_map_names(caller));
        accessible_map_ids.chain(owned_map_ids)
    }

    pub fn get_owned_non_empty_map_names(&self, caller: Principal) -> Vec<MapName> {
        let map_names: std::collections::HashSet<Vec<u8>> = self
            .mapkey_vals
            .keys_range(((caller, Blob::default()), Blob::default())..)
            .take_while(|((principal, _map_name), _key_name)| principal == &caller)
            .map(|((_principal, map_name), _key_name)| map_name.as_slice().to_vec())
            .collect();
        map_names
            .into_iter()
            .map(|map_name| Blob::<32>::try_from(map_name.as_slice()).unwrap())
            .collect()
    }

    pub fn insert_encrypted_value(
        &mut self,
        caller: Principal,
        key_id: KeyId,
        key: MapKey,
        encrypted_value: EncryptedMapValue,
    ) -> Result<Option<EncryptedMapValue>, String> {
        match self.key_manager.get_user_rights(caller, key_id, caller)? {
            Some(AccessRights::ReadWrite) | Some(AccessRights::ReadWriteManage) => Ok(()),
            Some(AccessRights::Read) | None => Err("unauthorized user".to_string()),
        }?;

        Ok(self.mapkey_vals.insert((key_id, key), encrypted_value))
    }

    pub fn remove_encrypted_value(
        &mut self,
        caller: Principal,
        key_id: KeyId,
        key: MapKey,
    ) -> Result<Option<EncryptedMapValue>, String> {
        match self.key_manager.get_user_rights(caller, key_id, caller)? {
            Some(AccessRights::ReadWrite) | Some(AccessRights::ReadWriteManage) => Ok(()),
            Some(AccessRights::Read) | None => Err("unauthorized user".to_string()),
        }?;

        Ok(self.mapkey_vals.remove(&(key_id, key)))
    }

    pub fn get_vetkey_verification_key(
        &self,
    ) -> impl Future<Output = VetKeyVerificationKey> + Send + Sync {
        self.key_manager.get_vetkey_verification_key()
    }

    pub fn get_encrypted_vetkey(
        &self,
        caller: Principal,
        key_id: KeyId,
        transport_key: TransportKey,
    ) -> Result<impl Future<Output = VetKey> + Send + Sync, String> {
        self.key_manager
            .get_encrypted_vetkey(caller, key_id, transport_key)
    }

    pub fn get_user_rights(
        &self,
        caller: Principal,
        key_id: KeyId,
        user: Principal,
    ) -> Result<Option<AccessRights>, String> {
        self.key_manager.get_user_rights(caller, key_id, user)
    }

    pub fn set_user_rights(
        &mut self,
        caller: Principal,
        key_id: KeyId,
        user: Principal,
        access_rights: AccessRights,
    ) -> Result<Option<AccessRights>, String> {
        self.key_manager
            .set_user_rights(caller, key_id, user, access_rights)
    }

    pub fn remove_user(
        &mut self,
        caller: Principal,
        key_id: KeyId,
        user: Principal,
    ) -> Result<Option<AccessRights>, String> {
        self.key_manager.remove_user(caller, key_id, user)
    }
}

#[derive(serde::Deserialize, candid::CandidType)]
pub struct EncryptedMapData {
    pub map_owner: Principal,
    pub map_name: ByteBuf,
    pub keyvals: Vec<(ByteBuf, EncryptedMapValue)>,
    pub access_control: Vec<(Principal, AccessRights)>,
}

#[cfg(feature = "expose-testing-api")]
pub fn set_vetkd_testing_canister_id(canister_id: Principal) {
    ic_vetkd_cdk_key_manager::set_vetkd_testing_canister_id(canister_id);
}
