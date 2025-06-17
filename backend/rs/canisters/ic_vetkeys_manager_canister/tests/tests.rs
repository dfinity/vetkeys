use candid::{decode_one, encode_args, encode_one, CandidType, Principal};
use ic_vetkeys::key_manager::{key_id_to_vetkd_input, VetKey, VetKeyVerificationKey};
use ic_vetkeys::types::{AccessRights, ByteBuf, TransportKey};
use ic_vetkeys::{DerivedPublicKey, EncryptedVetKey, TransportSecretKey};
use ic_vetkeys_test_utils::{git_root_dir, random_self_authenticating_principal, reproducible_rng};
use pocket_ic::{PocketIc, PocketIcBuilder};
use rand::{CryptoRng, Rng};
use std::path::Path;

#[test]
fn should_obtain_verification_key() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);
    let verification_key: VetKeyVerificationKey = env.update(
        env.principal_0,
        "get_vetkey_verification_key",
        encode_one(()).unwrap(),
    );
    assert_eq!(verification_key.as_ref().len(), 96);
    assert_ne!(verification_key, VetKeyVerificationKey::from(vec![0; 96]));
}

#[test]
fn should_obtain_owned_encrypted_vetkey() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);
    let key_owner = env.principal_0;
    let key_name = random_key_name(rng);
    let transport_key = random_transport_key(rng);
    let transport_key_bytes = TransportKey::from(transport_key.public_key());
    let encrypted_vetkey = env
        .update::<Result<VetKey, String>>(
            env.principal_0,
            "get_encrypted_vetkey",
            encode_args((key_owner, key_name, transport_key_bytes)).unwrap(),
        )
        .unwrap();

    assert_eq!(encrypted_vetkey.as_ref().len(), 192);
    assert_ne!(encrypted_vetkey, VetKeyVerificationKey::from(vec![0; 192]));
}

#[test]
fn encrypted_vetkey_should_validate() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let verification_key_bytes: VetKeyVerificationKey = env.update(
        env.principal_0,
        "get_vetkey_verification_key",
        encode_one(()).unwrap(),
    );

    let key_owner = env.principal_0;
    let key_name = random_key_name(rng);
    let transport_key = random_transport_key(rng);
    let transport_key_bytes = TransportKey::from(transport_key.public_key());

    let vetkey = || {
        let encrypted_vetkey = env
            .update::<Result<VetKey, String>>(
                env.principal_0,
                "get_encrypted_vetkey",
                encode_args((key_owner, key_name.clone(), transport_key_bytes.clone())).unwrap(),
            )
            .unwrap();

        let derived_public_key =
            DerivedPublicKey::deserialize(verification_key_bytes.as_ref()).unwrap();
        let encrypted_vetkey = EncryptedVetKey::deserialize(encrypted_vetkey.as_ref()).unwrap();

        encrypted_vetkey
            .decrypt_and_verify(
                &transport_key,
                &derived_public_key,
                &key_id_to_vetkd_input(key_owner, key_name.as_ref()),
            )
            .expect("failed to decrypt and verify `vetkey")
    };

    assert_eq!(vetkey(), vetkey());
}

#[test]
fn key_sharing_should_work() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let verification_key_bytes: VetKeyVerificationKey = env.update(
        env.principal_0,
        "get_vetkey_verification_key",
        encode_one(()).unwrap(),
    );

    let key_owner = env.principal_0;
    let not_key_owner = env.principal_1;
    let key_name = random_key_name(rng);

    assert_eq!(
        env.query::<Result<Option<AccessRights>, String>>(
            not_key_owner,
            "get_user_rights",
            encode_args((key_owner, key_name.clone(), not_key_owner)).unwrap(),
        ),
        Err("unauthorized".to_string())
    );

    let prev_rights = env
        .update::<Result<Option<AccessRights>, String>>(
            env.principal_0,
            "set_user_rights",
            encode_args((
                key_owner,
                key_name.clone(),
                env.principal_1,
                AccessRights::ReadWriteManage,
            ))
            .unwrap(),
        )
        .unwrap();
    assert_eq!(prev_rights, None);

    let current_rights_owner = env
        .query::<Result<Option<AccessRights>, String>>(
            key_owner,
            "get_user_rights",
            encode_args((key_owner, key_name.clone(), key_owner)).unwrap(),
        )
        .unwrap();
    assert_eq!(current_rights_owner, Some(AccessRights::ReadWriteManage));

    let current_rights_shared = env
        .query::<Result<Option<AccessRights>, String>>(
            not_key_owner,
            "get_user_rights",
            encode_args((key_owner, key_name.clone(), not_key_owner)).unwrap(),
        )
        .unwrap();
    assert_eq!(current_rights_shared, Some(AccessRights::ReadWriteManage));

    let mut get_vetkey = |caller: Principal| -> Vec<u8> {
        let transport_key = random_transport_key(rng);
        let transport_key_bytes = TransportKey::from(transport_key.public_key());
        let encrypted_vetkey = env
            .update::<Result<VetKey, String>>(
                caller,
                "get_encrypted_vetkey",
                encode_args((key_owner, key_name.clone(), transport_key_bytes)).unwrap(),
            )
            .unwrap();

        let derived_public_key =
            DerivedPublicKey::deserialize(verification_key_bytes.as_ref()).unwrap();
        let encrypted_vetkey = EncryptedVetKey::deserialize(encrypted_vetkey.as_ref()).unwrap();

        let vetkey = encrypted_vetkey
            .decrypt_and_verify(
                &transport_key,
                &derived_public_key,
                &key_id_to_vetkd_input(key_owner, key_name.as_ref()),
            )
            .expect("failed to decrypt and verify `vetkey");

        vetkey.signature_bytes().as_ref().to_vec()
    };

    assert_eq!(get_vetkey(env.principal_0), get_vetkey(env.principal_1));
}

struct TestEnvironment {
    pic: PocketIc,
    example_canister_id: Principal,
    principal_0: Principal,
    principal_1: Principal,
}

impl TestEnvironment {
    fn new<R: Rng + CryptoRng>(rng: &mut R) -> Self {
        let pic = PocketIcBuilder::new()
            .with_application_subnet()
            .with_ii_subnet()
            .with_fiduciary_subnet()
            .with_nonmainnet_features(true)
            .build();

        let example_canister_id = pic.create_canister();
        pic.add_cycles(example_canister_id, 2_000_000_000_000);

        let example_wasm_bytes = load_key_manager_example_canister_wasm();
        pic.install_canister(
            example_canister_id,
            example_wasm_bytes,
            encode_one("dfx_test_key").unwrap(),
            None,
        );

        // Make sure the canister is properly initialized
        fast_forward(&pic, 5);

        Self {
            pic,
            example_canister_id,
            principal_0: random_self_authenticating_principal(rng),
            principal_1: random_self_authenticating_principal(rng),
        }
    }

    fn update<T: CandidType + for<'de> candid::Deserialize<'de>>(
        &self,
        caller: Principal,
        method_name: &str,
        args: Vec<u8>,
    ) -> T {
        let reply = self
            .pic
            .update_call(self.example_canister_id, caller, method_name, args);
        match reply {
            Ok(data) => decode_one(&data).expect("failed to decode reply"),
            Err(user_error) => panic!("canister returned a user error: {user_error}"),
        }
    }

    fn query<T: CandidType + for<'de> candid::Deserialize<'de>>(
        &self,
        caller: Principal,
        method_name: &str,
        args: Vec<u8>,
    ) -> T {
        let reply = self
            .pic
            .query_call(self.example_canister_id, caller, method_name, args);
        match reply {
            Ok(data) => decode_one(&data).expect("failed to decode reply"),
            Err(user_error) => panic!("canister returned a user error: {user_error}"),
        }
    }
}

fn load_key_manager_example_canister_wasm() -> Vec<u8> {
    let wasm_path_string = match std::env::var("CUSTOM_WASM_PATH") {
        Ok(path) if !path.is_empty() => path,
        _ => format!(
            "{}/target/wasm32-unknown-unknown/release/ic_vetkeys_manager_canister.wasm",
            git_root_dir()
        ),
    };
    let wasm_path = Path::new(&wasm_path_string);
    std::fs::read(wasm_path)
        .expect("wasm does not exist - run `cargo build --release --target wasm32-unknown-unknown`")
}

fn random_transport_key<R: Rng + CryptoRng>(rng: &mut R) -> TransportSecretKey {
    let mut seed = vec![0u8; 32];
    rng.fill_bytes(&mut seed);
    TransportSecretKey::from_seed(seed).unwrap()
}

fn fast_forward(ic: &PocketIc, ticks: u64) {
    for _ in 0..ticks - 1 {
        ic.tick();
    }
}

fn random_key_name<R: Rng + CryptoRng>(rng: &mut R) -> ByteBuf {
    let length = rng.gen_range(0..32);
    let mut key_name = vec![0u8; length];
    rng.fill_bytes(&mut key_name);
    ByteBuf::from(key_name)
}
