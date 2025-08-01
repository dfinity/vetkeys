use candid::Principal;
use ic_vetkeys_example_encrypted_chat_backend::types::*;

/// This test ensures that the minimum value of the ChatId enum is the direct chat with the management canister as both participants.
#[test]
fn test_chat_id_min_value() {
    assert_eq!(
        ChatId::MIN_VALUE,
        ChatId::Direct(DirectChatId::new((
            Principal::management_canister(),
            Principal::management_canister(),
        )))
    );

    assert!(ChatId::MIN_VALUE < ChatId::Group(GroupChatId(0)));

    // modify this test if more enum variants are added
    match ChatId::MIN_VALUE {
        ChatId::Direct(_) => {}
        ChatId::Group(_) => {}
    };
}
