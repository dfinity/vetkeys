//! Macro that generates a complete EncryptedMaps canister.
//!
//! [`export_encrypted_maps_canister!`] expands — in the calling crate — to the
//! `#[init]`, the stable state, and every `#[query]`/`#[update]` endpoint, so an
//! adopter's `lib.rs` can be a few lines instead of ~200 lines of hand-written
//! boilerplate. Because the macro is the single source of the endpoint set, the
//! exposed Candid interface is exactly the one the `@icp-sdk/vetkeys` frontend
//! expects, by construction.
//!
//! The generated code refers to the calling crate's dependencies, so an adopter
//! must depend on: `ic-cdk`, `ic-cdk-management-canister`, `ic-stable-structures`,
//! `candid`, and `ic-vetkeys`.

/// Generates a complete EncryptedMaps canister in the calling crate.
///
/// The `#[init]` takes the vetKD key name (e.g. `"test_key_1"` locally,
/// `"key_1"` on mainnet) and the canister uses memory ids `0..=3` of a
/// dedicated [`MemoryManager`](ic_stable_structures::memory_manager::MemoryManager).
///
/// The macro brings `Principal` and the EncryptedMaps types into scope, so
/// invoke it in a module that does not import conflicting names. It does not
/// emit the Candid interface, because `ic_cdk::export_candid!()` cannot be
/// expanded from within another macro — call it yourself after the macro.
///
/// # Example
///
/// ```ignore
/// // lib.rs of an EncryptedMaps canister:
/// ic_vetkeys::export_encrypted_maps_canister!("my_app_domain_separator");
/// ic_cdk::export_candid!();
/// ```
///
/// The `domain_separator` isolates the derived keys of this application from
/// other vetKeys deployments and must stay stable for the life of the canister.
#[macro_export]
macro_rules! export_encrypted_maps_canister {
    ($domain_separator:expr) => {
        use ::candid::Principal;
        use $crate::encrypted_maps::{
            EncryptedMapData, EncryptedMaps, VetKey, VetKeyVerificationKey,
        };
        use $crate::types::{AccessRights, ByteBuf, EncryptedMapValue, TransportKey};

        type EncryptedMapsCanisterMemory = ::ic_stable_structures::memory_manager::VirtualMemory<
            ::ic_stable_structures::DefaultMemoryImpl,
        >;

        thread_local! {
            static MEMORY_MANAGER: ::std::cell::RefCell<
                ::ic_stable_structures::memory_manager::MemoryManager<
                    ::ic_stable_structures::DefaultMemoryImpl,
                >,
            > = ::std::cell::RefCell::new(
                ::ic_stable_structures::memory_manager::MemoryManager::init(
                    ::ic_stable_structures::DefaultMemoryImpl::default(),
                ),
            );
            static ENCRYPTED_MAPS: ::std::cell::RefCell<Option<EncryptedMaps<AccessRights>>> =
                const { ::std::cell::RefCell::new(None) };
        }

        fn __encrypted_maps_memory(id: u8) -> EncryptedMapsCanisterMemory {
            MEMORY_MANAGER.with(|m| {
                m.borrow()
                    .get(::ic_stable_structures::memory_manager::MemoryId::new(id))
            })
        }

        fn __encrypted_maps_bytebuf_to_blob(
            buf: ByteBuf,
        ) -> Result<::ic_stable_structures::storable::Blob<32>, String> {
            ::ic_stable_structures::storable::Blob::try_from(buf.as_ref())
                .map_err(|_| "too large input".to_string())
        }

        #[ic_cdk::init]
        fn init(key_name: String) {
            let key_id = ::ic_cdk_management_canister::VetKDKeyId {
                curve: ::ic_cdk_management_canister::VetKDCurve::Bls12_381_G2,
                name: key_name,
            };
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.replace(EncryptedMaps::init(
                    $domain_separator,
                    key_id,
                    __encrypted_maps_memory(0),
                    __encrypted_maps_memory(1),
                    __encrypted_maps_memory(2),
                    __encrypted_maps_memory(3),
                ))
            });
        }

        #[ic_cdk::query]
        fn get_accessible_shared_map_names() -> Vec<(Principal, ByteBuf)> {
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_accessible_shared_map_names(ic_cdk::api::msg_caller())
                    .into_iter()
                    .map(|map_id| (map_id.0, ByteBuf::from(map_id.1.as_ref().to_vec())))
                    .collect()
            })
        }

        #[ic_cdk::query]
        fn get_shared_user_access_for_map(
            key_owner: Principal,
            key_name: ByteBuf,
        ) -> Result<Vec<(Principal, AccessRights)>, String> {
            let key_name = __encrypted_maps_bytebuf_to_blob(key_name)?;
            let key_id = (key_owner, key_name);
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_shared_user_access_for_map(ic_cdk::api::msg_caller(), key_id)
            })
        }

        #[ic_cdk::query]
        fn get_encrypted_values_for_map(
            map_owner: Principal,
            map_name: ByteBuf,
        ) -> Result<Vec<(ByteBuf, EncryptedMapValue)>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            let result = ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_encrypted_values_for_map(ic_cdk::api::msg_caller(), map_id)
            });
            result.map(|map_values| {
                map_values
                    .into_iter()
                    .map(|(key, value)| (ByteBuf::from(key.as_slice().to_vec()), value))
                    .collect()
            })
        }

        #[ic_cdk::query]
        fn get_all_accessible_encrypted_values(
        ) -> Vec<((Principal, ByteBuf), Vec<(ByteBuf, EncryptedMapValue)>)> {
            ENCRYPTED_MAPS
                .with_borrow(|encrypted_maps| {
                    encrypted_maps
                        .as_ref()
                        .unwrap()
                        .get_all_accessible_encrypted_values(ic_cdk::api::msg_caller())
                })
                .into_iter()
                .map(|((owner, map_name), encrypted_values)| {
                    (
                        (owner, ByteBuf::from(map_name.as_ref().to_vec())),
                        encrypted_values
                            .into_iter()
                            .map(|(key, value)| (ByteBuf::from(key.as_ref().to_vec()), value))
                            .collect(),
                    )
                })
                .collect()
        }

        #[ic_cdk::query]
        fn get_all_accessible_encrypted_maps() -> Vec<EncryptedMapData<AccessRights>> {
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_all_accessible_encrypted_maps(ic_cdk::api::msg_caller())
            })
        }

        #[ic_cdk::query]
        fn get_encrypted_value(
            map_owner: Principal,
            map_name: ByteBuf,
            map_key: ByteBuf,
        ) -> Result<Option<EncryptedMapValue>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps.as_ref().unwrap().get_encrypted_value(
                    ic_cdk::api::msg_caller(),
                    map_id,
                    __encrypted_maps_bytebuf_to_blob(map_key)?,
                )
            })
        }

        #[ic_cdk::update]
        fn remove_map_values(
            map_owner: Principal,
            map_name: ByteBuf,
        ) -> Result<Vec<EncryptedMapValue>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            let result = ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps
                    .as_mut()
                    .unwrap()
                    .remove_map_values(ic_cdk::api::msg_caller(), map_id)
            });
            result.map(|removed| {
                removed
                    .into_iter()
                    .map(|key| ByteBuf::from(key.as_ref().to_vec()))
                    .collect()
            })
        }

        #[ic_cdk::query]
        fn get_owned_non_empty_map_names() -> Vec<ByteBuf> {
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_owned_non_empty_map_names(ic_cdk::api::msg_caller())
                    .into_iter()
                    .map(|map_name| ByteBuf::from(map_name.as_slice().to_vec()))
                    .collect()
            })
        }

        #[ic_cdk::update]
        fn insert_encrypted_value(
            map_owner: Principal,
            map_name: ByteBuf,
            map_key: ByteBuf,
            value: EncryptedMapValue,
        ) -> Result<Option<EncryptedMapValue>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.as_mut().unwrap().insert_encrypted_value(
                    ic_cdk::api::msg_caller(),
                    map_id,
                    __encrypted_maps_bytebuf_to_blob(map_key)?,
                    value,
                )
            })
        }

        #[ic_cdk::update]
        fn remove_encrypted_value(
            map_owner: Principal,
            map_name: ByteBuf,
            map_key: ByteBuf,
        ) -> Result<Option<EncryptedMapValue>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.as_mut().unwrap().remove_encrypted_value(
                    ic_cdk::api::msg_caller(),
                    map_id,
                    __encrypted_maps_bytebuf_to_blob(map_key)?,
                )
            })
        }

        #[ic_cdk::update]
        async fn get_vetkey_verification_key() -> VetKeyVerificationKey {
            ENCRYPTED_MAPS
                .with_borrow(|encrypted_maps| {
                    encrypted_maps
                        .as_ref()
                        .unwrap()
                        .get_vetkey_verification_key()
                })
                .await
        }

        #[ic_cdk::update]
        async fn get_encrypted_vetkey(
            map_owner: Principal,
            map_name: ByteBuf,
            transport_key: TransportKey,
        ) -> Result<VetKey, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            Ok(ENCRYPTED_MAPS
                .with_borrow(|encrypted_maps| {
                    encrypted_maps.as_ref().unwrap().get_encrypted_vetkey(
                        ic_cdk::api::msg_caller(),
                        map_id,
                        transport_key,
                    )
                })?
                .await)
        }

        #[ic_cdk::query]
        fn get_user_rights(
            map_owner: Principal,
            map_name: ByteBuf,
            user: Principal,
        ) -> Result<Option<AccessRights>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps.as_ref().unwrap().get_user_rights(
                    ic_cdk::api::msg_caller(),
                    map_id,
                    user,
                )
            })
        }

        #[ic_cdk::update]
        fn set_user_rights(
            map_owner: Principal,
            map_name: ByteBuf,
            user: Principal,
            access_rights: AccessRights,
        ) -> Result<Option<AccessRights>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.as_mut().unwrap().set_user_rights(
                    ic_cdk::api::msg_caller(),
                    map_id,
                    user,
                    access_rights,
                )
            })
        }

        #[ic_cdk::update]
        fn remove_user(
            map_owner: Principal,
            map_name: ByteBuf,
            user: Principal,
        ) -> Result<Option<AccessRights>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.as_mut().unwrap().remove_user(
                    ic_cdk::api::msg_caller(),
                    map_id,
                    user,
                )
            })
        }
    };
}
