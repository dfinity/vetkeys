use candid::{decode_one, encode_args, encode_one, CandidType, Principal};
use ic_vetkeys_example_verifiable_nft::types::*;
use pocket_ic::{PocketIc, PocketIcBuilder};
use rand::{CryptoRng, Rng, SeedableRng};
use rand_chacha::ChaCha20Rng;
use std::path::Path;

const TEST_KEY_ID: &'static str = "dfx_test_key";

fn verify_nft(png: &[u8], canister_id: &Principal) -> Result<(), String> {
    //std::fs::write("latest_nft.png", png);
    let mut decoder = png::Decoder::new(png);
    decoder.set_ignore_text_chunk(false);

    let mut reader = decoder.read_info().map_err(|e| format!("{:?}", e))?;

    let mut title = None;
    let mut originator = None;
    let mut vrf = None;

    let nft_collection = "Anxious Llama Kayak Association";

    let header_prefix = format!("{} ", nft_collection);

    for header in &reader.info().uncompressed_latin1_text {
        if !header.keyword.starts_with(&header_prefix) {
            continue;
        }

        let what = header.keyword.replace(&header_prefix, "");

        match what.as_ref() {
            "Title" => {
                title = Some(header.text.clone());
            }
            "Originator" => {
                originator = Some(header.text.clone());
            }
            "Vrf" => {
                vrf = Some(header.text.clone());
            }
            _ => { /* ignore */ }
        }
    }

    if title.is_none() || originator.is_none() || vrf.is_none() {
        return Err("missing a header".to_string());
    }

    let title = title.unwrap();
    let originator = originator.unwrap();
    let vrf_hex = vrf.unwrap();
    let vrf = hex::decode(&vrf_hex).map_err(|e| format!("{:?}", e))?;

    let key_id = ic_cdk::management_canister::VetKDKeyId {
        curve: ic_cdk::management_canister::VetKDCurve::Bls12_381_G2,
        name: TEST_KEY_ID.to_string(),
    };
    let master_key = ic_vetkeys::MasterPublicKey::for_pocketic_key(&key_id)
        .ok_or("Unknown key ID".to_string())?;

    let dpk = master_key
        .derive_canister_key(canister_id.as_slice())
        .derive_sub_key(nft_collection.as_bytes());

    if !ic_vetkeys::verify_bls_signature(&dpk, title.as_bytes(), &vrf) {
        return Err("Invalid VRF".to_string());
    }

    let png = {
        let mut buf = vec![0; reader.output_buffer_size()];
        let _info = reader
            .next_frame(&mut buf)
            .map_err(|e| format!("{:?}", e))?;
        reader.finish().map_err(|e| format!("{:?}", e))?;
        buf
    };

    let identicon_input = format!(
        "Title '{}' Originator '{}' VrfOutput '{}'",
        title, originator, vrf_hex
    );

    let identicon = identicon_rs::Identicon::new(&identicon_input);
    let image = identicon
        .generate_image()
        .map_err(|e| format!("{:?}", e))?
        .to_rgb8()
        .into_raw();

    if image != png {
        return Err("PNG does not match".to_string());
    }

    // seems legit!
    Ok(())
}

#[test]
fn should_create_nft_drop_event() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let arbitrary_timeout = 30;

    let current_time: u64 = env.pic.get_time().as_nanos_since_unix_epoch();
    let drop_time = current_time + arbitrary_timeout;

    env.update::<()>(
        env.principal_0,
        "create_new_event",
        encode_args(("Kario Mart 8", drop_time)).unwrap(),
    );

    let drops: Vec<NftDropEvent> = env.update(
        env.principal_1,
        "list_active_events",
        encode_one(()).unwrap(),
    );

    assert_eq!(drops.len(), 1);

    assert_eq!(drops[0].event_id, 1);
    assert_eq!(drops[0].title, "Kario Mart 8");

    env.update::<()>(
        env.principal_1,
        "sign_up_for_event",
        encode_one(drops[0].event_id).unwrap(),
    );

    // Now wait until the event completes:
    loop {
        env.pic.tick();

        let drops: Vec<NftDropEvent> = env.update(
            env.principal_1,
            "list_active_events",
            encode_one(()).unwrap(),
        );

        if drops.is_empty() {
            break;
        }
    }

    assert!(env
        .update::<Vec<u64>>(env.principal_0, "get_my_nfts", encode_one(()).unwrap())
        .is_empty());
    let nft_ids: Vec<u64> = env.update(env.principal_1, "get_my_nfts", encode_one(()).unwrap());

    assert_eq!(nft_ids.len(), 1);

    let nft: Result<NftDrop, String> = env.update(
        env.principal_1,
        "retrieve_nft",
        encode_one(nft_ids[0]).unwrap(),
    );

    let nft = nft.unwrap();

    verify_nft(&nft.nft, &env.canister_id).expect("Unable to verify produced NFT");
}

#[test]
fn this_nft_is_popular() {
    let mut rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let total_signups = 20;
    let arbitrary_timeout = total_signups + 30;

    let current_time: u64 = env.pic.get_time().as_nanos_since_unix_epoch();
    let drop_time = current_time + arbitrary_timeout;

    env.update::<()>(
        env.principal_0,
        "create_new_event",
        encode_args(("The Legend of Zorro", drop_time)).unwrap(),
    );

    let drops: Vec<NftDropEvent> = env.update(
        env.principal_1,
        "list_active_events",
        encode_one(()).unwrap(),
    );

    assert_eq!(drops.len(), 1);

    let principals: Vec<Principal> = (0..total_signups)
        .map(|_| random_self_authenticating_principal(&mut rng))
        .collect();

    for principal in &principals {
        env.update::<()>(
            *principal,
            "sign_up_for_event",
            encode_one(drops[0].event_id).unwrap(),
        );
    }

    // Now wait until the event completes:
    loop {
        env.pic.tick();

        let drops: Vec<NftDropEvent> = env.update(
            env.principal_1,
            "list_active_events",
            encode_one(()).unwrap(),
        );

        if drops.is_empty() {
            break;
        }
    }

    for principal in &principals {
        let nft_ids: Vec<u64> = env.update(*principal, "get_my_nfts", encode_one(()).unwrap());
        assert_eq!(nft_ids.len(), 1);

        let nft: Result<NftDrop, String> =
            env.update(*principal, "retrieve_nft", encode_one(nft_ids[0]).unwrap());

        let nft = nft.unwrap();

        verify_nft(&nft.nft, &env.canister_id).expect("Unable to verify produced NFT");
    }
}

struct TestEnvironment {
    pic: PocketIc,
    canister_id: Principal,
    principal_0: Principal,
    principal_1: Principal,
}

impl TestEnvironment {
    fn new<R: Rng + CryptoRng>(rng: &mut R) -> Self {
        println!("creating pocketic");
        let pic = PocketIcBuilder::new()
            .with_application_subnet()
            .with_ii_subnet()
            .with_fiduciary_subnet()
            .with_nonmainnet_features(true)
            .build();

        println!("creating canister");

        let canister_id = pic.create_canister();
        pic.add_cycles(canister_id, 2_000_000_000_000);

        let wasm_bytes = load_verifiable_nft_example_canister_wasm();
        pic.install_canister(
            canister_id,
            wasm_bytes,
            encode_one(TEST_KEY_ID).unwrap(),
            None,
        );

        // Make sure the canister is properly initialized
        fast_forward(&pic, 5);

        Self {
            pic,
            canister_id,
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
            .update_call(self.canister_id, caller, method_name, args);
        match reply {
            Ok(data) => decode_one(&data).expect("failed to decode reply"),
            Err(user_error) => panic!("canister returned a user error: {user_error}"),
        }
    }
}

fn git_root_dir() -> String {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .expect("Failed to execute git command");
    assert!(output.status.success());
    let root_dir_with_newline =
        String::from_utf8(output.stdout).expect("Failed to convert stdout to string");
    root_dir_with_newline.trim_end_matches('\n').to_string()
}

fn load_verifiable_nft_example_canister_wasm() -> Vec<u8> {
    let wasm_path_string = match std::env::var("CUSTOM_WASM_PATH") {
        Ok(path) if !path.is_empty() => path,
        _ => format!(
            "{}/examples/verifiable_nft/rust/target/wasm32-unknown-unknown/release/ic_vetkeys_example_verifiable_nft.wasm",
            git_root_dir()
        ),
    };
    println!("loading {}", wasm_path_string);
    let wasm_path = Path::new(&wasm_path_string);
    std::fs::read(wasm_path)
        .expect("wasm does not exist - run `cargo build --release --target wasm32-unknown-unknown`")
}

fn fast_forward(ic: &PocketIc, ticks: u64) {
    for _ in 0..ticks - 1 {
        ic.tick();
    }
}

pub fn random_self_authenticating_principal<R: Rng + CryptoRng>(rng: &mut R) -> Principal {
    let mut fake_public_key = vec![0u8; 32];
    rng.fill_bytes(&mut fake_public_key);
    Principal::self_authenticating::<&[u8]>(fake_public_key.as_ref())
}

pub fn reproducible_rng() -> ChaCha20Rng {
    let seed = rand::thread_rng().gen();
    println!("RNG seed: {seed:?}");
    ChaCha20Rng::from_seed(seed)
}
