//! Macro that generates an EncryptedMaps canister.
//!
//! [`export_encrypted_maps_canister!`] expands — in the calling crate — to the
//! `#[init]`/`#[post_upgrade]`, the stable state, and the `#[query]`/`#[update]`
//! endpoints, so an adopter's `lib.rs` can be a few lines instead of ~200 lines
//! of hand-written boilerplate. Because the macro is the single source of the
//! endpoint set, the exposed Candid interface is exactly the one the
//! `@icp-sdk/vetkeys` frontend expects, by construction.
//!
//! It has two forms:
//!
//! * **Full** (the common case) — every endpoint, a complete drop-in canister.
//! * **`custom_value_endpoints`** — the same *control-plane* endpoints (vetKD
//!   keys, access control, map-name enumeration) plus the state and lifecycle
//!   hooks and a [`with_encrypted_maps`]/[`with_encrypted_maps_mut`] accessor,
//!   but **none** of the endpoints that read or write encrypted map *values*.
//!   Use this when the canister keeps extra state linked to each value (e.g. a
//!   metadata row per entry) and must own the value read/write endpoints itself
//!   to keep that state consistent.
//!
//! The generated code refers to the calling crate's dependencies, so an adopter
//! must depend on: `ic-cdk`, `ic-cdk-management-canister`, `ic-stable-structures`,
//! `candid`, and `ic-vetkeys`.
//!
//! [`with_encrypted_maps`]: #accessing-the-encryptedmaps-instance
//! [`with_encrypted_maps_mut`]: #accessing-the-encryptedmaps-instance

/// Generates an EncryptedMaps canister in the calling crate.
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
/// `"key_1"` on mainnet). The macro injects items into the invoking module: the
/// `#[init]`/`#[post_upgrade]`, the `#[query]`/`#[update]` endpoints, and the
/// [`with_encrypted_maps`]/[`with_encrypted_maps_mut`] accessors (plus a private
/// thread-local and helpers). Library *types* are imported under unique aliases,
/// so they never clash with your own `use` imports; but the endpoint functions
/// and the two accessors are ordinary items in your module — don't define items
/// of your own with those names. It does not emit the Candid interface, because
/// `ic_cdk::export_candid!()` cannot be expanded from within another macro —
/// call it yourself after the macro.
///
/// [`with_encrypted_maps`]: #accessing-the-encryptedmaps-instance
/// [`with_encrypted_maps_mut`]: #accessing-the-encryptedmaps-instance
///
/// # Full canister
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
///
/// # Bring your own value endpoints (`custom_value_endpoints`)
///
/// Pass the `custom_value_endpoints` marker to generate everything **except**
/// the endpoints that read or write encrypted map values. This is for the
/// "wrap-and-extend" pattern: a canister that stores something *alongside* each
/// value — for example a backend-authoritative metadata record per entry — and
/// therefore must expose its own `*_with_metadata` read/write endpoints and keep
/// the two stores consistent in a single call.
///
/// ```ignore
/// // Generates: #[init]/#[post_upgrade], the stable EncryptedMaps state, the
/// // control-plane endpoints, and the `with_encrypted_maps`/`_mut` accessors.
/// // Does NOT generate any value read/write endpoints.
/// ic_vetkeys::export_encrypted_maps_canister!(
///     "my_app_domain_separator",
///     [memory(0), memory(1), memory(2), memory(3)],
///     custom_value_endpoints,
/// );
///
/// thread_local! {
///     // Adopter-owned side-state, in the same MemoryManager under another id.
///     static METADATA: RefCell<MetadataMap> =
///         RefCell::new(ic_stable_structures::StableBTreeMap::init(memory(4)));
/// }
///
/// #[ic_cdk::update]
/// fn insert_encrypted_value_with_metadata(
///     map_owner: Principal, map_name: ByteBuf, map_key: ByteBuf,
///     value: EncryptedMapValue, /* ...app fields... */
/// ) -> Result<Option<EncryptedMapValue>, String> {
///     // Reuse the library's crypto + access control via the accessor:
///     let previous = with_encrypted_maps_mut(|em| em.insert_encrypted_value(
///         ic_cdk::api::msg_caller(),
///         (map_owner, blob(map_name)?),
///         blob(map_key)?,
///         value,
///     ))?;
///     // ...maintain the linked METADATA row in the same call...
///     Ok(previous)
/// }
/// ic_cdk::export_candid!();
/// ```
///
/// ## Which endpoints are omitted, and why
///
/// The omitted set is the **value data-plane** — the endpoints whose result or
/// effect is an encrypted map value:
///
/// * writes: `insert_encrypted_value`, `remove_encrypted_value`,
///   `remove_map_values`
/// * reads: `get_encrypted_value`, `get_encrypted_values_for_map`,
///   `get_all_accessible_encrypted_values`, `get_all_accessible_encrypted_maps`
///
/// Only the **writes** can break an adopter's invariant (they mutate the value
/// store, so a raw write could leave your linked side-state out of sync — a
/// correctness issue). The **reads** are omitted for API-surface hygiene: with a
/// wrapped read like `*_with_metadata`, you almost never also want a
/// metadata-less value view sitting next to it. Omitting the whole group is a
/// deliberate, safe-by-construction cut: it is one decision instead of a
/// per-endpoint exclusion list you could under-specify (leaving a value endpoint
/// exposed), and any value endpoint added to the library in future is hidden
/// from `custom_value_endpoints` adopters automatically.
///
/// If you only need to guard writes and are happy keeping the standard value
/// reads, you currently re-implement those reads by hand; a fine-grained
/// exclusion API can be added later if that need becomes real.
///
/// The generated **control-plane** endpoints are always safe to keep — none of
/// them read or write map values (`set_user_rights`/`remove_user` touch only the
/// access-control state, with no value cascade):
/// `get_accessible_shared_map_names`, `get_shared_user_access_for_map`,
/// `get_owned_non_empty_map_names`, `get_vetkey_verification_key`,
/// `get_encrypted_vetkey`, `get_user_rights`, `set_user_rights`, `remove_user`.
///
/// ## Accessing the EncryptedMaps instance
///
/// Both forms emit two accessors so your own endpoints can reuse the library's
/// vetKD/crypto/access-control logic without re-wiring init or memory:
///
/// ```ignore
/// fn with_encrypted_maps<R>(f: impl FnOnce(&EncryptedMaps<AccessRights>) -> R) -> R;
/// fn with_encrypted_maps_mut<R>(f: impl FnOnce(&mut EncryptedMaps<AccessRights>) -> R) -> R;
/// ```
///
/// Note that `with_encrypted_maps_mut` gives you the raw value mutators
/// (`insert_encrypted_value`, …). When you wrap them, keep your linked
/// side-state updated in the *same* endpoint call.
#[macro_export]
macro_rules! export_encrypted_maps_canister {
    // Full canister: control-plane + value endpoints.
    (
        $domain_separator:expr,
        [
            $memory_domain_separator:expr,
            $memory_access_control:expr,
            $memory_shared_keys:expr,
            $memory_encrypted_maps:expr $(,)?
        ] $(,)?
    ) => {
        $crate::__export_encrypted_maps_common!(
            $domain_separator,
            [
                $memory_domain_separator,
                $memory_access_control,
                $memory_shared_keys,
                $memory_encrypted_maps
            ]
        );
        $crate::__export_encrypted_maps_control_plane_endpoints!();
        $crate::__export_encrypted_maps_value_endpoints!();
    };

    // Control-plane only: caller provides its own value read/write endpoints.
    (
        $domain_separator:expr,
        [
            $memory_domain_separator:expr,
            $memory_access_control:expr,
            $memory_shared_keys:expr,
            $memory_encrypted_maps:expr $(,)?
        ],
        custom_value_endpoints $(,)?
    ) => {
        $crate::__export_encrypted_maps_common!(
            $domain_separator,
            [
                $memory_domain_separator,
                $memory_access_control,
                $memory_shared_keys,
                $memory_encrypted_maps
            ]
        );
        $crate::__export_encrypted_maps_control_plane_endpoints!();
    };
}

/// State, lifecycle hooks, helpers, and accessors shared by both forms.
///
/// Not a public API — an implementation detail of
/// [`export_encrypted_maps_canister!`].
#[doc(hidden)]
#[macro_export]
macro_rules! __export_encrypted_maps_common {
    (
        $domain_separator:expr,
        [
            $memory_domain_separator:expr,
            $memory_access_control:expr,
            $memory_shared_keys:expr,
            $memory_encrypted_maps:expr
        ]
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

        /// Run `f` with a shared reference to the initialized `EncryptedMaps`.
        ///
        /// For hand-written endpoints that reuse the library's vetKD / crypto /
        /// access-control logic. `pub(crate)` so it is reachable from submodules
        /// of the invoking crate. Traps if called before `#[init]` (it never is —
        /// the state is set up in `#[init]`/`#[post_upgrade]`).
        #[allow(dead_code)]
        pub(crate) fn with_encrypted_maps<__EmR>(
            f: impl FnOnce(&__EmEncryptedMaps<__EmAccessRights>) -> __EmR,
        ) -> __EmR {
            ENCRYPTED_MAPS.with_borrow(|encrypted_maps| {
                f(encrypted_maps
                    .as_ref()
                    .expect("EncryptedMaps is not initialized (called before #[init]/#[post_upgrade])"))
            })
        }

        /// Run `f` with a mutable reference to the initialized `EncryptedMaps`.
        ///
        /// Gives access to the raw value mutators; when wrapping them, keep any
        /// linked side-state updated in the same endpoint call. `pub(crate)` so
        /// it is reachable from submodules of the invoking crate.
        #[allow(dead_code)]
        pub(crate) fn with_encrypted_maps_mut<__EmR>(
            f: impl FnOnce(&mut __EmEncryptedMaps<__EmAccessRights>) -> __EmR,
        ) -> __EmR {
            ENCRYPTED_MAPS.with_borrow_mut(|encrypted_maps| {
                f(encrypted_maps
                    .as_mut()
                    .expect("EncryptedMaps is not initialized (called before #[init]/#[post_upgrade])"))
            })
        }
    };
}

/// The control-plane endpoints (vetKD keys, access control, map-name
/// enumeration). None of these read or write encrypted map values, so they are
/// always safe to emit. Not a public API.
#[doc(hidden)]
#[macro_export]
macro_rules! __export_encrypted_maps_control_plane_endpoints {
    () => {
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

/// The value data-plane endpoints (read/write encrypted map values). Omitted by
/// the `custom_value_endpoints` form. Not a public API.
#[doc(hidden)]
#[macro_export]
macro_rules! __export_encrypted_maps_value_endpoints {
    () => {
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
        fn get_all_accessible_encrypted_values() -> Vec<(
            (__EmPrincipal, __EmByteBuf),
            Vec<(__EmByteBuf, __EmEncryptedMapValue)>,
        )> {
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
    };
}
