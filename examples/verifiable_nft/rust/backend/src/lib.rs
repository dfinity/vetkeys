pub mod types;
use candid::Principal;
use ic_cdk::management_canister::{VetKDCurve, VetKDKeyId};
use ic_cdk::{init, query, update};
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    Cell as StableCell, DefaultMemoryImpl, StableBTreeMap, StableBTreeSet,
};
use std::cell::RefCell;
use types::*;

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    static KEY_NAME: RefCell<StableCell<String, Memory>> =
        RefCell::new(StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(2))),
            String::new(),
        )
        .expect("failed to initialize key name"));

    static NFT_COUNTER: RefCell<NftDropEventId> = RefCell::new(0);

    static ACTIVE_DROP_EVENTS: RefCell<StableBTreeSet<(Timestamp, NftDropEventId), Memory>> = RefCell::new(StableBTreeSet::init(
        MEMORY_MANAGER.with_borrow(|m| m.get(MemoryId::new(3)))
        ));

    static DROP_INFO: RefCell<StableBTreeMap<NftDropEventId, NftDropEvent, Memory>> = RefCell::new(StableBTreeMap::init(
        MEMORY_MANAGER.with_borrow(|m| m.get(MemoryId::new(4)))
    ));

    static DROP_ENTRIES: RefCell<StableBTreeSet<(NftDropEventId, Principal), Memory>> = RefCell::new(StableBTreeSet::init(
        MEMORY_MANAGER.with_borrow(|m| m.get(MemoryId::new(5)))
    ));

    static USER_TO_OWNED_NFTS: RefCell<StableBTreeSet<(Principal, NftDropId), Memory>> = RefCell::new(StableBTreeSet::init(
        MEMORY_MANAGER.with_borrow(|m| m.get(MemoryId::new(6)))
    ));

    static ALL_NFTS: RefCell<StableBTreeMap<NftDropId, NftDrop, Memory>> = RefCell::new(StableBTreeMap::init(
        MEMORY_MANAGER.with_borrow(|m| m.get(MemoryId::new(7)))
    ));
}

#[init]
fn init(key_name_string: String) {
    KEY_NAME.with_borrow_mut(|key_name| {
        key_name
            .set(key_name_string)
            .expect("failed to set key name");
    });
}

#[update]
async fn create_new_event(title: String, drops_at: Timestamp) {
    let event_id = next_nft_id();

    ACTIVE_DROP_EVENTS.with_borrow_mut(|events| {
        events.insert((drops_at, event_id));
    });

    DROP_INFO.with_borrow_mut(|events| {
        let event = NftDropEvent {
            event_id,
            title,
            drops_at,
        };

        events.insert(event_id, event);
    });

    finalize_active_drops().await;
}

#[update]
async fn list_active_events() -> Vec<NftDropEvent> {
    finalize_active_drops().await;

    let event_ids = ACTIVE_DROP_EVENTS.with_borrow(|events| {
        let mut output = vec![];

        for (_, event) in events.iter() {
            output.push(event);
        }

        output
    });

    DROP_INFO.with_borrow(|drops| {
        let mut output = vec![];

        for event_id in &event_ids {
            if let Some(drop) = drops.get(event_id) {
                output.push(drop);
            }
        }

        output
    })
}

#[update]
async fn sign_up_for_event(drop_id: NftDropEventId) {
    finalize_active_drops().await;

    let caller = ic_cdk::api::msg_caller();

    DROP_ENTRIES.with_borrow_mut(|entries| {
        entries.insert((drop_id, caller));
    });
}

#[update]
async fn get_my_nfts() -> Vec<NftDropId> {
    finalize_active_drops().await;

    let caller = ic_cdk::api::msg_caller();

    USER_TO_OWNED_NFTS.with_borrow(|ownership| {
        ownership
            .range((caller, 0)..)
            .take_while(|(owner, _id)| *owner == caller)
            .map(|(_owner, id)| id)
            .collect()
    })
}

#[query]
async fn retrieve_nft(nft_id: NftDropId) -> Result<NftDrop, String> {
    let caller = ic_cdk::api::msg_caller();

    let owned_by_user =
        USER_TO_OWNED_NFTS.with_borrow(|ownership| ownership.contains(&(caller, nft_id)));

    if !owned_by_user {
        return Err(format!("You do not own an NFT with this identity"));
    }

    ALL_NFTS.with_borrow(|nfts| {
        if let Some(nft) = nfts.get(&nft_id) {
            Ok(nft)
        } else {
            Err(format!("Failed to find NFT id {}", nft_id))
        }
    })
}

async fn finalize_active_drops() {
    let current_time = ic_cdk::api::time();

    let completed_drops = ACTIVE_DROP_EVENTS.with_borrow_mut(|events| {
        let mut result = vec![];

        while let Some((drops_at, event)) = events.pop_first() {
            if drops_at <= current_time {
                result.push(event);
            } else {
                // Not completed yet, put it back
                events.insert((drops_at, event));
                // Exit the loop since the list is ordered by time
                break;
            }
        }

        result
    });

    /*
     * We do a single VRF for the entire drop with a fixed context/input then
     * derive multiple NFTs one-per-user from that VRF output
     */

    for drop_id in completed_drops {
        let entrants = DROP_ENTRIES.with_borrow_mut(|entries| {
            let mut entrants = vec![];

            for (nft_id, principal) in entries.iter() {
                if nft_id == drop_id {
                    entrants.push(principal);
                }
            }

            // Now remove any that we are finalizing...
            for principal in &entrants {
                entries.remove(&(drop_id, *principal));
            }

            entrants
        });

        if entrants.is_empty() {
            // Nobody entered this NFT; no point in running the VRF in that case
            continue;
        }

        let drop_title = DROP_INFO.with_borrow(|drops| {
            drops
                .get(&drop_id)
                .expect("Failed to lookup NFT drop")
                .title
                .clone()
        });
        ic_cdk::println!("Finalizing '{}'", drop_title);

        let vrf_input = drop_title.clone();
        let vrf_context = format!("Anxious Llama Kayak Association");

        let vrf_output = ic_vetkeys::management_canister::compute_vrf(
            vrf_input.as_bytes().to_vec(),
            vrf_context.as_bytes().to_vec(),
            key_id(),
        )
        .await
        .expect("Failed to compute VRF");

        ic_cdk::println!("VRF output complete");

        // Derive each entrants ID
        for (idx, entrant) in entrants.iter().enumerate() {
            let nft_id = ((drop_id as u64) << 32) | idx as u64;

            ic_cdk::println!("Creating NFT for '{}'", entrant);
            let nft_drop = NftDrop {
                event_id: drop_id,
                title: drop_title.clone(),
                nft: generate_nft_png(entrant, &drop_title, &vrf_output)
                    .expect("Failed to generate image"),
            };

            ALL_NFTS.with_borrow_mut(|nfts| {
                nfts.insert(nft_id, nft_drop);
            });

            USER_TO_OWNED_NFTS.with_borrow_mut(|drops| {
                drops.insert((*entrant, nft_id));
            });
        }
    }
}

fn generate_nft_png(
    user: &Principal,
    title: &str,
    vrf: &ic_vetkeys::VrfOutput,
) -> Result<Vec<u8>, String> {
    let vrf_hex = hex::encode(vrf.proof().serialize());

    let identicon_input = format!(
        "Title '{}' Originator '{}' VrfOutput '{}'",
        title, user, vrf_hex
    );

    let text_chunks = vec![
        ("Title", title.to_owned()),
        ("Originator", format!("{}", user)),
        ("Vrf", vrf_hex),
    ];

    let identicon = identicon_rs::Identicon::new(&identicon_input);
    let image = identicon
        .generate_image()
        .map_err(|e| format!("{:?}", e))?
        .to_rgb8();
    let mut buffer = Vec::new();

    {
        let info = png::Info::with_size(image.width(), image.height());

        let mut encoder =
            png::Encoder::with_info(&mut buffer, info).map_err(|e| format!("{:?}", e))?;

        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Best);
        encoder.set_filter(png::FilterType::NoFilter);
        encoder.set_adaptive_filter(png::AdaptiveFilterType::NonAdaptive);

        for (key, value) in &text_chunks {
            encoder
                .add_text_chunk(
                    format!("Anxious Llama Kayak Association {}", key),
                    value.to_owned(),
                )
                .map_err(|e| format!("{:?}", e))?;
        }

        let mut writer = encoder.write_header().map_err(|e| format!("{:?}", e))?;
        writer
            .write_image_data(image.into_raw().as_slice())
            .map_err(|e| format!("{:?}", e))?;
    };

    Ok(buffer)
}

fn next_nft_id() -> NftDropEventId {
    NFT_COUNTER.with(|counter| {
        *counter.borrow_mut() += 1;
        *counter.borrow()
    })
}

fn key_id() -> VetKDKeyId {
    VetKDKeyId {
        curve: VetKDCurve::Bls12_381_G2,
        name: KEY_NAME.with_borrow(|key_name| key_name.get().clone()),
    }
}

// In the following, we register a custom getrandom implementation because
// otherwise getrandom (which is a dependency of some other dependencies) fails to compile.
// This is necessary because getrandom by default fails to compile for the
// wasm32-unknown-unknown target (which is required for deploying a canister).
// Our custom implementation always fails, which is sufficient here because
// the used RNGs are _manually_ seeded rather than by the system.
#[cfg(all(
    target_arch = "wasm32",
    target_vendor = "unknown",
    target_os = "unknown"
))]
getrandom::register_custom_getrandom!(always_fail);
#[cfg(all(
    target_arch = "wasm32",
    target_vendor = "unknown",
    target_os = "unknown"
))]
fn always_fail(_buf: &mut [u8]) -> Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED)
}

ic_cdk::export_candid!();
