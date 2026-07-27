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
/// A canister may have only one
/// [`MemoryManager`](ic_stable_structures::memory_manager::MemoryManager), so
/// the macro does **not** create one. Instead you pass the four `Memory`
/// instances EncryptedMaps needs, in this order:
/// `[domain_separator, access_control, shared_keys, encrypted_maps]`. This lets
/// the canister keep its own additional stable state in the same manager under
/// other memory ids.
///
/// The `#[init]` takes the vetKD key name (e.g. `"test_key_1"` locally,
/// `"key_1"` on mainnet). The macro brings `Principal` and the EncryptedMaps
/// types into scope, so invoke it in a module that does not import conflicting
/// names. It does not emit the Candid interface, because
/// `ic_cdk::export_candid!()` cannot be expanded from within another macro —
/// call it yourself after the macro.
///
/// # Example
///
/// ```ignore
/// use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
/// use ic_stable_structures::DefaultMemoryImpl;
/// use std::cell::RefCell;
///
/// type Memory = VirtualMemory<DefaultMemoryImpl>;
///
/// thread_local! {
///     static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
///         RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
/// }
///
/// fn memory(id: u8) -> Memory {
///     MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(id)))
/// }
///
/// ic_vetkeys::export_encrypted_maps_canister!(
///     "my_app_domain_separator",
///     [memory(0), memory(1), memory(2), memory(3)],
/// );
/// ic_cdk::export_candid!();
/// ```
///
/// The `domain_separator` isolates the derived keys of this application from
/// other vetKeys deployments and must stay stable for the life of the canister.
#[macro_export]
macro_rules! export_encrypted_maps_canister {
    (
        $domain_separator:expr,
        [
            $memory_domain_separator:expr,
            $memory_access_control:expr,
            $memory_shared_keys:expr,
            $memory_encrypted_maps:expr $(,)?
        ] $(,)?
    ) => {
        // Import everything under unique aliases so the expansion never binds a
        // common name (`Principal`, `ByteBuf`, …) in the caller's module — that
        // would collide (E0252) with the adopter's own imports.
        use ::candid::Principal as __EmPrincipal;
        use $crate::encrypted_maps::EncryptedMapData as __EmEncryptedMapData;
        use $crate::encrypted_maps::EncryptedMaps as __EmEncryptedMaps;
        use $crate::encrypted_maps::VetKey as __EmVetKey;
        use $crate::encrypted_maps::VetKeyVerificationKey as __EmVetKeyVerificationKey;
        use $crate::types::AccessRights as __EmAccessRights;
        use $crate::types::ByteBuf as __EmByteBuf;
        use $crate::types::EncryptedMapValue as __EmEncryptedMapValue;
        use $crate::types::TransportKey as __EmTransportKey;

        ::std::thread_local! {
            static ENCRYPTED_MAPS: ::std::cell::RefCell<Option<__EmEncryptedMaps<__EmAccessRights>>> =
                const { ::std::cell::RefCell::new(None) };
        }

        fn __encrypted_maps_bytebuf_to_blob(
            buf: __EmByteBuf,
        ) -> Result<::ic_stable_structures::storable::Blob<32>, String> {
            ::ic_stable_structures::storable::Blob::try_from(buf.as_ref())
                .map_err(|_| "too large input".to_string())
        }

        #[::ic_cdk::init]
        fn __encrypted_maps_init(key_name: String) {
            __encrypted_maps_setup(key_name);
        }

        // After an upgrade `#[init]` does not run, so the thread-local wrapper
        // would be `None` and every endpoint would trap. Re-attach it to the
        // (persisted) stable state here. The vetKD key id and domain separator
        // are loaded from the config `StableCell`, which ignores the passed
        // defaults when it already holds a value — so the key name given here
        // is irrelevant after an upgrade.
        #[::ic_cdk::post_upgrade]
        fn __encrypted_maps_post_upgrade() {
            __encrypted_maps_setup(String::new());
        }

        fn __encrypted_maps_setup(key_name: String) {
            let key_id = ::ic_cdk_management_canister::VetKDKeyId {
                curve: ::ic_cdk_management_canister::VetKDCurve::Bls12_381_G2,
                name: key_name,
            };
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.replace(__EmEncryptedMaps::init(
                    $domain_separator,
                    key_id,
                    $memory_domain_separator,
                    $memory_access_control,
                    $memory_shared_keys,
                    $memory_encrypted_maps,
                ))
            });
        }

        #[::ic_cdk::query]
        fn get_accessible_shared_map_names() -> Vec<(__EmPrincipal, __EmByteBuf)> {
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_accessible_shared_map_names(::ic_cdk::api::msg_caller())
                    .into_iter()
                    .map(|map_id| (map_id.0, __EmByteBuf::from(map_id.1.as_ref().to_vec())))
                    .collect()
            })
        }

        #[::ic_cdk::query]
        fn get_shared_user_access_for_map(
            key_owner: __EmPrincipal,
            key_name: __EmByteBuf,
        ) -> Result<Vec<(__EmPrincipal, __EmAccessRights)>, String> {
            let key_name = __encrypted_maps_bytebuf_to_blob(key_name)?;
            let key_id = (key_owner, key_name);
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_shared_user_access_for_map(::ic_cdk::api::msg_caller(), key_id)
            })
        }

        #[::ic_cdk::query]
        fn get_encrypted_values_for_map(
            map_owner: __EmPrincipal,
            map_name: __EmByteBuf,
        ) -> Result<Vec<(__EmByteBuf, __EmEncryptedMapValue)>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            let result = ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_encrypted_values_for_map(::ic_cdk::api::msg_caller(), map_id)
            });
            result.map(|map_values| {
                map_values
                    .into_iter()
                    .map(|(key, value)| (__EmByteBuf::from(key.as_slice().to_vec()), value))
                    .collect()
            })
        }

        #[::ic_cdk::query]
        fn get_all_accessible_encrypted_values(
        ) -> Vec<((__EmPrincipal, __EmByteBuf), Vec<(__EmByteBuf, __EmEncryptedMapValue)>)> {
            ENCRYPTED_MAPS
                .with_borrow(|encrypted_maps| {
                    encrypted_maps
                        .as_ref()
                        .unwrap()
                        .get_all_accessible_encrypted_values(::ic_cdk::api::msg_caller())
                })
                .into_iter()
                .map(|((owner, map_name), encrypted_values)| {
                    (
                        (owner, __EmByteBuf::from(map_name.as_ref().to_vec())),
                        encrypted_values
                            .into_iter()
                            .map(|(key, value)| (__EmByteBuf::from(key.as_ref().to_vec()), value))
                            .collect(),
                    )
                })
                .collect()
        }

        #[::ic_cdk::query]
        fn get_all_accessible_encrypted_maps() -> Vec<__EmEncryptedMapData<__EmAccessRights>> {
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_all_accessible_encrypted_maps(::ic_cdk::api::msg_caller())
            })
        }

        #[::ic_cdk::query]
        fn get_encrypted_value(
            map_owner: __EmPrincipal,
            map_name: __EmByteBuf,
            map_key: __EmByteBuf,
        ) -> Result<Option<__EmEncryptedMapValue>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps.as_ref().unwrap().get_encrypted_value(
                    ::ic_cdk::api::msg_caller(),
                    map_id,
                    __encrypted_maps_bytebuf_to_blob(map_key)?,
                )
            })
        }

        #[::ic_cdk::update]
        fn remove_map_values(
            map_owner: __EmPrincipal,
            map_name: __EmByteBuf,
        ) -> Result<Vec<__EmEncryptedMapValue>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            let result = ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps
                    .as_mut()
                    .unwrap()
                    .remove_map_values(::ic_cdk::api::msg_caller(), map_id)
            });
            result.map(|removed| {
                removed
                    .into_iter()
                    .map(|key| __EmByteBuf::from(key.as_ref().to_vec()))
                    .collect()
            })
        }

        #[::ic_cdk::query]
        fn get_owned_non_empty_map_names() -> Vec<__EmByteBuf> {
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps
                    .as_ref()
                    .unwrap()
                    .get_owned_non_empty_map_names(::ic_cdk::api::msg_caller())
                    .into_iter()
                    .map(|map_name| __EmByteBuf::from(map_name.as_slice().to_vec()))
                    .collect()
            })
        }

        #[::ic_cdk::update]
        fn insert_encrypted_value(
            map_owner: __EmPrincipal,
            map_name: __EmByteBuf,
            map_key: __EmByteBuf,
            value: __EmEncryptedMapValue,
        ) -> Result<Option<__EmEncryptedMapValue>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.as_mut().unwrap().insert_encrypted_value(
                    ::ic_cdk::api::msg_caller(),
                    map_id,
                    __encrypted_maps_bytebuf_to_blob(map_key)?,
                    value,
                )
            })
        }

        #[::ic_cdk::update]
        fn remove_encrypted_value(
            map_owner: __EmPrincipal,
            map_name: __EmByteBuf,
            map_key: __EmByteBuf,
        ) -> Result<Option<__EmEncryptedMapValue>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.as_mut().unwrap().remove_encrypted_value(
                    ::ic_cdk::api::msg_caller(),
                    map_id,
                    __encrypted_maps_bytebuf_to_blob(map_key)?,
                )
            })
        }

        #[::ic_cdk::update]
        async fn get_vetkey_verification_key() -> __EmVetKeyVerificationKey {
            ENCRYPTED_MAPS
                .with_borrow(|encrypted_maps| {
                    encrypted_maps
                        .as_ref()
                        .unwrap()
                        .get_vetkey_verification_key()
                })
                .await
        }

        #[::ic_cdk::update]
        async fn get_encrypted_vetkey(
            map_owner: __EmPrincipal,
            map_name: __EmByteBuf,
            transport_key: __EmTransportKey,
        ) -> Result<__EmVetKey, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            Ok(ENCRYPTED_MAPS
                .with_borrow(|encrypted_maps| {
                    encrypted_maps.as_ref().unwrap().get_encrypted_vetkey(
                        ::ic_cdk::api::msg_caller(),
                        map_id,
                        transport_key,
                    )
                })?
                .await)
        }

        #[::ic_cdk::query]
        fn get_user_rights(
            map_owner: __EmPrincipal,
            map_name: __EmByteBuf,
            user: __EmPrincipal,
        ) -> Result<Option<__EmAccessRights>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                encrypted_maps.as_ref().unwrap().get_user_rights(
                    ::ic_cdk::api::msg_caller(),
                    map_id,
                    user,
                )
            })
        }

        #[::ic_cdk::update]
        fn set_user_rights(
            map_owner: __EmPrincipal,
            map_name: __EmByteBuf,
            user: __EmPrincipal,
            access_rights: __EmAccessRights,
        ) -> Result<Option<__EmAccessRights>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.as_mut().unwrap().set_user_rights(
                    ::ic_cdk::api::msg_caller(),
                    map_id,
                    user,
                    access_rights,
                )
            })
        }

        #[::ic_cdk::update]
        fn remove_user(
            map_owner: __EmPrincipal,
            map_name: __EmByteBuf,
            user: __EmPrincipal,
        ) -> Result<Option<__EmAccessRights>, String> {
            let map_name = __encrypted_maps_bytebuf_to_blob(map_name)?;
            let map_id = (map_owner, map_name);
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                encrypted_maps.as_mut().unwrap().remove_user(
                    ::ic_cdk::api::msg_caller(),
                    map_id,
                    user,
                )
            })
        }
    };
}
