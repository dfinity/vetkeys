use assert_matches::assert_matches;
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager},
    DefaultMemoryImpl,
};
use ic_vetkd_cdk_key_manager::KeyManager;
use ic_vetkd_cdk_test_utils::{
    random_access_rights, random_name, random_self_authenticating_principal,
    random_unique_memory_ids, random_utf8_string, reproducible_rng,
};
use ic_vetkd_cdk_types::AccessRights;
use rand::{CryptoRng, Rng};

#[test]
fn can_init_memory() {
    // prevent the compiler from optimizing away the function call
    std::hint::black_box(random_key_manager(&mut reproducible_rng()));
}

#[test]
fn can_add_user_to_map() {
    let rng = &mut reproducible_rng();
    let caller = random_self_authenticating_principal(rng);
    let name = random_name(rng);

    let mut key_manager = random_key_manager(rng);

    let user_to_be_added = random_self_authenticating_principal(rng);
    let access_rights = random_access_rights(rng);
    assert_eq!(
        key_manager.set_user_rights(
            caller,
            (caller, name.clone()),
            user_to_be_added,
            access_rights
        ),
        Ok(None)
    );
    assert_eq!(
        key_manager.set_user_rights(caller, (caller, name), user_to_be_added, access_rights),
        Ok(Some(access_rights))
    );
}

#[test]
fn can_remove_user_from_map() {
    let rng = &mut reproducible_rng();
    let caller = random_self_authenticating_principal(rng);
    let name = random_name(rng);
    let mut key_manager = random_key_manager(rng);

    let user_to_be_added = random_self_authenticating_principal(rng);
    let access_rights = random_access_rights(rng);
    assert_eq!(
        key_manager.set_user_rights(
            caller,
            (caller, name.clone()),
            user_to_be_added,
            access_rights,
        ),
        Ok(None)
    );
    assert_eq!(
        key_manager.remove_user(caller, (caller, name), user_to_be_added,),
        Ok(Some(access_rights))
    );
}

#[test]
fn add_or_remove_user_by_unauthorized_fails() {
    let rng = &mut reproducible_rng();
    let caller = random_self_authenticating_principal(rng);
    let name = random_name(rng);
    let mut key_manager = random_key_manager(rng);

    let mut unauthorized_callers = vec![random_self_authenticating_principal(rng)];

    for access_rights in [AccessRights::Read, AccessRights::ReadWrite] {
        let user_to_be_added = random_self_authenticating_principal(rng);

        assert_matches!(
            key_manager.set_user_rights(
                caller,
                (caller, name.clone()),
                user_to_be_added,
                access_rights,
            ),
            Ok(_)
        );

        unauthorized_callers.push(user_to_be_added);
    }

    for unauthorized_caller in unauthorized_callers {
        for target in [random_self_authenticating_principal(rng), caller] {
            assert_eq!(
                key_manager.remove_user(unauthorized_caller, (caller, name.clone()), target),
                Err("unauthorized".to_string())
            );
            assert_eq!(
                key_manager.set_user_rights(
                    unauthorized_caller,
                    (caller, name.clone()),
                    target,
                    AccessRights::Read,
                ),
                Err("unauthorized".to_string())
            );
        }
    }
}

#[test]
fn can_instantiate_two_key_managers() {
    let memory_manager = MemoryManager::init(DefaultMemoryImpl::default());
    let key_manager_1 = KeyManager::init(
        "key_manager_1",
        memory_manager.get(MemoryId::new(0)),
        memory_manager.get(MemoryId::new(1)),
        memory_manager.get(MemoryId::new(2)),
    );
    let key_manager_2 = KeyManager::init(
        "key_manager_2",
        memory_manager.get(MemoryId::new(3)),
        memory_manager.get(MemoryId::new(4)),
        memory_manager.get(MemoryId::new(5)),
    );
    // prevent the compiler from optimizing away the function call
    std::hint::black_box((key_manager_1, key_manager_2));
}

fn random_key_manager<R: Rng + CryptoRng>(rng: &mut R) -> KeyManager {
    let memory_manager = MemoryManager::init(DefaultMemoryImpl::default());
    let (_memory_id_encrypted_maps, memory_ids_key_manager) = random_unique_memory_ids(rng);
    let domain_separator_len = rng.gen_range(0..32);
    KeyManager::init(
        &random_utf8_string(rng, domain_separator_len),
        memory_manager.get(MemoryId::new(memory_ids_key_manager[0])),
        memory_manager.get(MemoryId::new(memory_ids_key_manager[1])),
        memory_manager.get(MemoryId::new(memory_ids_key_manager[2])),
    )
}

// TODO tests
// - create key
// - retrieve vetkey
// - retrieve vetkey and verification and and verify
// - add a user to a key
// - remove a user from a key
// - change user rights for a key
