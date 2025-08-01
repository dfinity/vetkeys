use candid::{decode_one, encode_args, encode_one, CandidType, Principal};
use ic_vetkeys_example_encrypted_chat_backend::types::{
    ChatId, ChatMessageId, EncryptedMessage, EncryptedMessageMetadata, GroupChatId,
    GroupChatMetadata, GroupModification, SenderMessageId, SymmetricKeyEpochCache,
    SymmetricKeyEpochId, Time, UserMessage, VetKeyEpochId, VetKeyEpochMetadata,
};
use pocket_ic::{PocketIc, PocketIcBuilder};
use rand::{CryptoRng, Rng, SeedableRng};
use rand_chacha::ChaCha20Rng;
use serde_bytes::ByteBuf;
use std::path::Path;

const NANOSECONDS_IN_MINUTE: u64 = 60_000_000_000;

#[test]
fn can_create_chat() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let mut expected_chat_id = 0;

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let result = env.update::<Result<GroupChatMetadata, String>>(
            env.principal_0,
            "create_group_chat",
            encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
        );

        assert_eq!(
            result,
            Ok(GroupChatMetadata {
                chat_id: GroupChatId(expected_chat_id),
                creation_timestamp: Time(env.pic.get_time().as_nanos_since_unix_epoch()),
            })
        );

        expected_chat_id += 1;
    }
}

#[test]
fn can_send_and_get_messages() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let all_participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();

        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
            )
            .unwrap();

        let message_content = b"dummy encrypted message".to_vec();

        let mut message_id_counters = std::collections::BTreeMap::from([
            (env.principal_0, 0),
            (env.principal_1, 0),
            (env.principal_2, 0),
        ]);

        let mut expected_chat_history = vec![];

        let chat_id = ChatId::Group(group_chat_metadata.chat_id);

        for caller in all_participants.iter().copied() {
            assert_eq!(
                env.update::<Vec<EncryptedMessage>>(
                    caller,
                    "get_some_messages_for_chat_starting_from",
                    encode_args((chat_id, ChatMessageId(0), Option::<u32>::None)).unwrap(),
                ),
                vec![]
            );
        }

        for _ in 0..10 {
            for sender in all_participants.iter().copied() {
                let message_id_raw = *message_id_counters.get(&sender).unwrap();
                message_id_counters.insert(sender, message_id_raw + 1);

                let user_message = UserMessage {
                    content: message_content.clone(),
                    vetkey_epoch: VetKeyEpochId(0),
                    symmetric_key_epoch: SymmetricKeyEpochId(0),
                    message_id: SenderMessageId(message_id_raw),
                };

                // + 1 is because the update call calls `tick` internally
                let expected_message_time = env.pic.get_time().as_nanos_since_unix_epoch() + 1;

                let message_time = env
                    .update::<Result<Time, String>>(
                        sender,
                        "send_group_message",
                        encode_args((user_message, group_chat_metadata.chat_id)).unwrap(),
                    )
                    .unwrap();

                let expected_added_chat_message = EncryptedMessage {
                    content: message_content.clone(),
                    metadata: EncryptedMessageMetadata {
                        sender,
                        timestamp: message_time,
                        vetkey_epoch: VetKeyEpochId(0),
                        symmetric_key_epoch: SymmetricKeyEpochId(0),
                        chat_message_id: ChatMessageId(expected_chat_history.len() as u64),
                    },
                };

                expected_chat_history.push(expected_added_chat_message);

                for caller in all_participants.iter().copied() {
                    assert_eq!(
                        env.update::<Vec<EncryptedMessage>>(
                            caller,
                            "get_some_messages_for_chat_starting_from",
                            encode_args((chat_id, ChatMessageId(0), Option::<u32>::None)).unwrap(),
                        ),
                        expected_chat_history
                    );
                }

                assert_eq!(message_time.0, expected_message_time);
            }
        }
    }
}

#[test]
fn fails_to_send_messages_with_wrong_symmetric_key_epoch() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let symmetric_key_rotation_minutes = Time(1_000);
    let chat_message_expiration_minutes = Time(10_000);

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let all_participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();

        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((
                    other_participants,
                    symmetric_key_rotation_minutes,
                    chat_message_expiration_minutes,
                ))
                .unwrap(),
            )
            .unwrap();

        let message_content = b"dummy encrypted message".to_vec();
        let chat_id = ChatId::Group(group_chat_metadata.chat_id);

        // check that epoch 1 fails while we have epoch 0
        for i in 0..2 {
            for sender in all_participants.iter().copied() {
                let symmetric_key_epoch = SymmetricKeyEpochId(1);
                let user_message = UserMessage {
                    content: message_content.clone(),
                    vetkey_epoch: VetKeyEpochId(0),
                    symmetric_key_epoch,
                    message_id: SenderMessageId(0),
                };

                let result = env.update::<Result<Time, String>>(
                    sender,
                    "send_group_message",
                    encode_args((user_message, group_chat_metadata.chat_id)).unwrap(),
                );

                assert_eq!(
                result,
                Err(
                    format!(
                        "Wrong symmetric key epoch {} is not yet active, current time is {} and epoch start is {}",
                        symmetric_key_epoch.0,
                        env.pic.get_time().as_nanos_since_unix_epoch(),
                        group_chat_metadata.creation_timestamp.0 + symmetric_key_epoch.0 * symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
                    )
                )
            );
            }

            // set time to `all_participants.len()` ns before the change to epoch 1
            if i == 0 {
                env.pic
                    .set_time(pocket_ic::Time::from_nanos_since_unix_epoch(
                        group_chat_metadata.creation_timestamp.0
                            + symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
                            - all_participants.len() as u64,
                    ));
            }
        }

        // check that epoch 0 and 2 fails while we have epoch 1
        for i in 0..2 {
            for sender in all_participants.iter().copied() {
                // use epoch 0
                {
                    let symmetric_key_epoch = SymmetricKeyEpochId(0);
                    let user_message = UserMessage {
                        content: message_content.clone(),
                        vetkey_epoch: VetKeyEpochId(0),
                        symmetric_key_epoch,
                        message_id: SenderMessageId(0),
                    };

                    let result = env.update::<Result<Time, String>>(
                        sender,
                        "send_group_message",
                        encode_args((user_message, group_chat_metadata.chat_id)).unwrap(),
                    );

                    assert_eq!(
                result,
                Err(
                    format!(
                        "Wrong symmetric key epoch: epoch {} is expired, current time is {} and epoch end is {}",
                        symmetric_key_epoch.0,
                        env.pic.get_time().as_nanos_since_unix_epoch(),
                        group_chat_metadata.creation_timestamp.0 + symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
                    )
                )
            );
                }

                // use epoch 2
                {
                    let symmetric_key_epoch = SymmetricKeyEpochId(2);
                    let user_message = UserMessage {
                        content: message_content.clone(),
                        vetkey_epoch: VetKeyEpochId(0),
                        symmetric_key_epoch,
                        message_id: SenderMessageId(0),
                    };

                    let result = env.update::<Result<Time, String>>(
                        sender,
                        "send_group_message",
                        encode_args((user_message, group_chat_metadata.chat_id)).unwrap(),
                    );

                    assert_eq!(
                result,
                Err(
                    format!(
                        "Wrong symmetric key epoch {} is not yet active, current time is {} and epoch start is {}",
                        symmetric_key_epoch.0,
                        env.pic.get_time().as_nanos_since_unix_epoch(),
                        group_chat_metadata.creation_timestamp.0 + symmetric_key_epoch.0 * symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
                    )
                )
            );
                }
            }

            // set time to `2 * all_participants.len()` ns before the change to epoch 2
            if i == 0 {
                env.pic
                    .set_time(pocket_ic::Time::from_nanos_since_unix_epoch(
                        group_chat_metadata.creation_timestamp.0
                            + 2 * symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
                            - 2 * all_participants.len() as u64,
                    ));
            }
        }

        // sanity check that no messages were added
        for caller in all_participants.iter().copied() {
            assert_eq!(
                env.update::<Vec<EncryptedMessage>>(
                    caller,
                    "get_some_messages_for_chat_starting_from",
                    encode_args((chat_id, ChatMessageId(0), Option::<u32>::None)).unwrap(),
                ),
                vec![]
            );
        }
    }
}

#[test]
fn can_get_vetkey_for_chat() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();
        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
            )
            .unwrap();

        let chat_id = ChatId::Group(group_chat_metadata.chat_id);
        // DON'T REUSE THE SAME TRANSPORT KEYS IN PRODUCTION
        let transport_key =
            ic_vetkeys::TransportSecretKey::from_seed(random_bytes(32, rng)).unwrap();

        let mut raw_encrypted_vetkeys = std::collections::BTreeMap::new();

        for latest_epoch in 0..3 {
            for caller in participants.iter().copied() {
                for epoch in 0..=latest_epoch {
                    for vetkey_epoch_id in
                        [Option::<VetKeyEpochId>::None, Some(VetKeyEpochId(epoch))]
                    {
                        if vetkey_epoch_id.is_none() && epoch != latest_epoch {
                            continue;
                        }

                        let raw_encrypted_vetkey = env
                            .update::<Result<serde_bytes::ByteBuf, String>>(
                                caller,
                                "derive_vetkey",
                                encode_args((
                                    chat_id,
                                    vetkey_epoch_id,
                                    ByteBuf::from(transport_key.public_key()),
                                ))
                                .unwrap(),
                            )
                            .unwrap()
                            .into_vec();
                        let opt_evicted =
                            raw_encrypted_vetkeys.insert(epoch, raw_encrypted_vetkey.clone());
                        if let Some(evicted) = opt_evicted {
                            assert_eq!(evicted, raw_encrypted_vetkey, "epoch: {epoch}, latest_epoch: {latest_epoch}, vetkey_epoch_id: {vetkey_epoch_id:?}");
                        }
                    }
                }
            }

            let new_epoch = env
                .update::<Result<VetKeyEpochId, String>>(
                    env.principal_0,
                    "rotate_chat_vetkey",
                    encode_args((chat_id,)).unwrap(),
                )
                .unwrap();
            assert_eq!(new_epoch, VetKeyEpochId(latest_epoch + 1));
        }

        for (epoch, raw_encrypted_vetkey) in raw_encrypted_vetkeys.into_iter() {
            let raw_public_key = env
                .update::<serde_bytes::ByteBuf>(
                    env.principal_0,
                    "public_key",
                    encode_args((chat_id, VetKeyEpochId(epoch))).unwrap(),
                )
                .into_vec();

            let public_key =
                ic_vetkeys::DerivedPublicKey::deserialize(raw_public_key.as_slice()).unwrap();

            let _vetkey = ic_vetkeys::EncryptedVetKey::deserialize(&raw_encrypted_vetkey)
                .unwrap()
                .decrypt_and_verify(&transport_key, &public_key, &[])
                .unwrap();
        }
    }
}

#[test]
fn public_keys_for_different_chats_and_epochs_are_different() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let chat_id_0 = ChatId::Group(GroupChatId(0));
    let chat_id_1 = ChatId::Group(GroupChatId(1));

    // we can get public key for any chats, also non-existing ones
    let raw_public_key_00 = env
        .update::<serde_bytes::ByteBuf>(
            env.principal_0,
            "public_key",
            encode_args((chat_id_0, VetKeyEpochId(0))).unwrap(),
        )
        .into_vec();

    let raw_public_key_01 = env
        .update::<serde_bytes::ByteBuf>(
            env.principal_0,
            "public_key",
            encode_args((chat_id_0, VetKeyEpochId(1))).unwrap(),
        )
        .into_vec();

    let raw_public_key_10 = env
        .update::<serde_bytes::ByteBuf>(
            env.principal_0,
            "public_key",
            encode_args((chat_id_1, VetKeyEpochId(0))).unwrap(),
        )
        .into_vec();

    assert_ne!(raw_public_key_00, raw_public_key_01);
    assert_ne!(raw_public_key_00, raw_public_key_10);
}

#[test]
fn fails_to_get_vetkey_for_chat_if_unauthorized() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let transport_key = ic_vetkeys::TransportSecretKey::from_seed(random_bytes(32, rng)).unwrap();

    for (other_participants, unauthorized_participants) in [
        (vec![], vec![env.principal_1, env.principal_2]),
        (vec![env.principal_1], vec![env.principal_2]),
    ] {
        env.update::<Result<GroupChatMetadata, String>>(
            env.principal_0,
            "create_group_chat",
            encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
        )
        .unwrap();

        let chat_id = ChatId::Group(GroupChatId(0));

        for unauthorized_participant in unauthorized_participants {
            let result = env.update::<Result<serde_bytes::ByteBuf, String>>(
                unauthorized_participant,
                "derive_vetkey",
                encode_args((
                    chat_id,
                    Option::<VetKeyEpochId>::None,
                    ByteBuf::from(transport_key.public_key()),
                ))
                .unwrap(),
            );

            assert_eq!(
                result,
                Err(format!(
                    "User {} does not have access to chat {chat_id:?} at epoch {:?}",
                    unauthorized_participant,
                    VetKeyEpochId(0)
                ))
            );
        }
    }
}

#[test]
fn fails_to_send_group_chat_message_with_wrong_vetkey_epoch() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();
        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
            )
            .unwrap();

        let chat_id = ChatId::Group(group_chat_metadata.chat_id);

        let message_content = b"dummy encrypted message".to_vec();

        // Start with using epoch 1 before it's been rotated to (should fail)
        for latest_epoch in 0..3 {
            for sender in participants.iter().copied() {
                let user_message = UserMessage {
                    content: message_content.clone(),
                    vetkey_epoch: VetKeyEpochId(latest_epoch + 1),
                    symmetric_key_epoch: SymmetricKeyEpochId(0),
                    message_id: SenderMessageId(0),
                };

                let result = env.update::<Result<Time, String>>(
                    sender,
                    "send_group_message",
                    encode_args((user_message, group_chat_metadata.chat_id)).unwrap(),
                );

                assert_eq!(
                    result,
                    Err(format!(
                        "vetKey epoch {:?} not found for chat {chat_id:?}",
                        VetKeyEpochId(latest_epoch + 1)
                    ))
                );
            }

            // Rotate to next epoch
            let new_epoch = env
                .update::<Result<VetKeyEpochId, String>>(
                    env.principal_0,
                    "rotate_chat_vetkey",
                    encode_args((chat_id,)).unwrap(),
                )
                .unwrap();
            assert_eq!(new_epoch, VetKeyEpochId(latest_epoch + 1));
        }

        // sanity check that no messages were added
        for caller in participants.iter().copied() {
            assert_eq!(
                env.update::<Vec<EncryptedMessage>>(
                    caller,
                    "get_some_messages_for_chat_starting_from",
                    encode_args((chat_id, ChatMessageId(0), Option::<u32>::None)).unwrap(),
                ),
                vec![]
            );
        }
    }
}

#[test]
fn fails_to_derive_vetkey_with_wrong_vetkey_epoch() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let transport_key = ic_vetkeys::TransportSecretKey::from_seed(random_bytes(32, rng)).unwrap();

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();

        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
            )
            .unwrap();

        let chat_id = ChatId::Group(group_chat_metadata.chat_id);

        // Use epoch 1 before it's been rotated to
        for latest_epoch in 0..3 {
            for caller in participants.iter().copied() {
                let result = env.update::<Result<serde_bytes::ByteBuf, String>>(
                    caller,
                    "derive_vetkey",
                    encode_args((
                        chat_id,
                        Some(VetKeyEpochId(latest_epoch + 1)),
                        ByteBuf::from(transport_key.public_key()),
                    ))
                    .unwrap(),
                );

                assert_eq!(
                    result,
                    Err(format!(
                        "vetKey epoch {:?} not found for chat {chat_id:?}",
                        VetKeyEpochId(latest_epoch + 1)
                    ))
                );
            }

            // Rotate to next epoch
            let new_epoch = env
                .update::<Result<VetKeyEpochId, String>>(
                    env.principal_0,
                    "rotate_chat_vetkey",
                    encode_args((chat_id,)).unwrap(),
                )
                .unwrap();
            assert_eq!(new_epoch, VetKeyEpochId(latest_epoch + 1));
        }
    }
}

#[test]
fn can_rotate_chat_vetkey() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();

        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
            )
            .unwrap();

        let chat_id = ChatId::Group(group_chat_metadata.chat_id);

        // Initially, epoch 0 should be the latest (we can verify this by trying to use epoch 1)
        let result = env.update::<Result<serde_bytes::ByteBuf, String>>(
            env.principal_0,
            "derive_vetkey",
            encode_args((
                chat_id,
                Some(VetKeyEpochId(1)),
                ByteBuf::from(vec![0u8; 32]), // dummy transport key
            ))
            .unwrap(),
        );
        assert!(result.is_err()); // Should fail because epoch 1 doesn't exist yet

        // Rotate to epoch 1
        let new_epoch = env
            .update::<Result<VetKeyEpochId, String>>(
                env.principal_0,
                "rotate_chat_vetkey",
                encode_args((chat_id,)).unwrap(),
            )
            .unwrap();
        assert_eq!(new_epoch, VetKeyEpochId(1));

        // All participants should be able to rotate
        for (i, participant) in participants.iter().copied().enumerate() {
            let new_epoch = env
                .update::<Result<VetKeyEpochId, String>>(
                    participant,
                    "rotate_chat_vetkey",
                    encode_args((chat_id,)).unwrap(),
                )
                .unwrap();
            // The epoch should increment for each rotation
            assert_eq!(new_epoch, VetKeyEpochId(i as u64 + 2));
        }
    }
}

#[test]
fn unauthorized_user_cannot_rotate_chat_vetkey() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for (other_participants, unauthorized_participants) in [
        (vec![], vec![env.principal_1, env.principal_2]),
        (vec![env.principal_1], vec![env.principal_2]),
    ] {
        env.update::<Result<GroupChatMetadata, String>>(
            env.principal_0,
            "create_group_chat",
            encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
        )
        .unwrap();

        let chat_id = ChatId::Group(GroupChatId(0));

        for unauthorized_participant in unauthorized_participants {
            let result = env.update::<Result<VetKeyEpochId, String>>(
                unauthorized_participant,
                "rotate_chat_vetkey",
                encode_args((chat_id,)).unwrap(),
            );

            assert_eq!(
                result,
                Err(format!(
                    "User {} does not have access to chat {chat_id:?} at epoch {:?}",
                    unauthorized_participant,
                    VetKeyEpochId(0)
                ))
            );
        }
    }
}

#[test]
fn can_update_and_get_symmetric_key_cache() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();

        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
            )
            .unwrap();

        let chat_id = ChatId::Group(group_chat_metadata.chat_id);
        let cache_data = b"dummy symmetric key cache".to_vec();
        let user_cache = SymmetricKeyEpochCache(cache_data.clone());

        // Initially, cache should be empty for all participants
        for caller in participants.iter().copied() {
            assert_eq!(
                env.update::<Result<Option<SymmetricKeyEpochCache>, String>>(
                    caller,
                    "get_my_symmetric_key_cache",
                    encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
                ),
                Ok(None)
            );
        }

        // Authorized user can create cache
        for caller in participants.iter().copied() {
            let result = env.update::<Result<(), String>>(
                caller,
                "update_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
            );
            assert_eq!(result, Ok(()));
        }

        // Authorized user can retrieve their cache
        for caller in participants.iter().copied() {
            let result = env.update::<Result<Option<SymmetricKeyEpochCache>, String>>(
                caller,
                "get_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
            );
            assert_eq!(result, Ok(Some(user_cache.clone())));
        }

        // Authorized user can update their cache
        let updated_cache_data = b"updated symmetric key cache".to_vec();
        let updated_user_cache = SymmetricKeyEpochCache(updated_cache_data.clone());

        for caller in participants.iter().copied() {
            let result = env.update::<Result<(), String>>(
                caller,
                "update_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0), updated_user_cache.clone())).unwrap(),
            );
            assert_eq!(result, Ok(()));
        }

        // Verify the cache was updated
        for caller in participants.iter().copied() {
            let result = env.update::<Result<Option<SymmetricKeyEpochCache>, String>>(
                caller,
                "get_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
            );
            assert_eq!(result, Ok(Some(updated_user_cache.clone())));
        }
    }
}

#[test]
fn unauthorized_user_cannot_access_symmetric_key_cache() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for (other_participants, unauthorized_participants) in [
        (vec![], vec![env.principal_1, env.principal_2]),
        (vec![env.principal_1], vec![env.principal_2]),
    ] {
        env.update::<Result<GroupChatMetadata, String>>(
            env.principal_0,
            "create_group_chat",
            encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
        )
        .unwrap();

        let chat_id = ChatId::Group(GroupChatId(0));
        let cache_data = b"dummy symmetric key cache".to_vec();
        let user_cache = SymmetricKeyEpochCache(cache_data);

        for unauthorized_participant in unauthorized_participants {
            // Unauthorized user cannot update cache
            let result = env.update::<Result<(), String>>(
                unauthorized_participant,
                "update_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
            );
            assert_eq!(
                result,
                Err(format!(
                    "User {} does not have access to chat {chat_id:?} at epoch {:?}",
                    unauthorized_participant,
                    VetKeyEpochId(0)
                ))
            );

            // Unauthorized user cannot get cache
            let result = env.update::<Result<Option<SymmetricKeyEpochCache>, String>>(
                unauthorized_participant,
                "get_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
            );
            assert_eq!(
                result,
                Err(format!(
                    "User {} does not have access to chat {chat_id:?} at epoch {:?}",
                    unauthorized_participant,
                    VetKeyEpochId(0)
                ))
            );
        }
    }
}

#[test]
fn cannot_access_cache_after_vetkey_epoch_expires() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();

        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((other_participants.clone(), Time(1_000), Time(10_000))).unwrap(),
            )
            .unwrap();

        let chat_id = ChatId::Group(group_chat_metadata.chat_id);
        let cache_data = b"dummy symmetric key cache".to_vec();
        let user_cache = SymmetricKeyEpochCache(cache_data.clone());

        // Create cache for epoch 0
        for caller in participants.iter().copied() {
            env.update::<Result<(), String>>(
                caller,
                "update_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
            )
            .unwrap();
        }

        // Rotate to epoch 1
        let new_epoch = env
            .update::<Result<VetKeyEpochId, String>>(
                env.principal_0,
                "rotate_chat_vetkey",
                encode_args((chat_id,)).unwrap(),
            )
            .unwrap();
        assert_eq!(new_epoch, VetKeyEpochId(1));

        let expiry_setting_minutes = 10_000;
        let expiry_time = group_chat_metadata.creation_timestamp.0
            + expiry_setting_minutes * NANOSECONDS_IN_MINUTE;
        // Fast forward time to expire epoch 0
        env.pic
            .set_time(pocket_ic::Time::from_nanos_since_unix_epoch(expiry_time));

        // Neither authorized nor unauthorized users can access expired epoch cache
        for caller in [env.principal_0, env.principal_1, env.principal_2]
            .into_iter()
            .filter(|p| *p == env.principal_0 || other_participants.contains(&p))
        {
            // Cannot update cache for expired epoch
            let result = env.update::<Result<(), String>>(
                caller,
                "update_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
            );
            assert_eq!(
                result,
                Err(format!("vetKey epoch {:?} expired", VetKeyEpochId(0),))
            );

            // Cannot get cache for expired epoch
            let result = env.update::<Result<Option<SymmetricKeyEpochCache>, String>>(
                caller,
                "get_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
            );
            assert_eq!(
                result,
                Err(format!("vetKey epoch {:?} expired", VetKeyEpochId(0),))
            );
        }
    }
}

#[test]
fn cannot_derive_vetkey_after_cache_exists() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();

        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
            )
            .unwrap();

        let chat_id = ChatId::Group(group_chat_metadata.chat_id);
        let cache_data = b"dummy symmetric key cache".to_vec();
        let user_cache = SymmetricKeyEpochCache(cache_data.clone());

        // DON'T REUSE THE SAME TRANSPORT KEYS IN PRODUCTION
        let transport_key =
            ic_vetkeys::TransportSecretKey::from_seed(random_bytes(32, rng)).unwrap();

        for caller in participants.iter().copied() {
            // Create cache
            env.update::<Result<(), String>>(
                caller,
                "update_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
            )
            .unwrap();

            // Now derive_vetkey should fail
            let result = env.update::<Result<serde_bytes::ByteBuf, String>>(
                caller,
                "derive_vetkey",
                encode_args((
                    chat_id,
                    Option::<VetKeyEpochId>::None,
                    ByteBuf::from(transport_key.public_key()),
                ))
                .unwrap(),
            );
            assert_eq!(
                result,
                Err(format!(
                    "User {} already has a cached key for chat {chat_id:?} at vetkey epoch {:?}",
                    caller,
                    VetKeyEpochId(0)
                ))
            );
        }
    }
}

#[test]
fn cache_is_separate_for_different_epochs() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    for other_participants in [
        vec![],
        vec![env.principal_1],
        vec![env.principal_1, env.principal_2],
    ] {
        let participants: Vec<_> = [env.principal_0]
            .into_iter()
            .chain(other_participants.iter().copied())
            .collect();

        let group_chat_metadata = env
            .update::<Result<GroupChatMetadata, String>>(
                env.principal_0,
                "create_group_chat",
                encode_args((other_participants, Time(1_000), Time(10_000))).unwrap(),
            )
            .unwrap();

        let chat_id = ChatId::Group(group_chat_metadata.chat_id);
        let user_cache_0 = SymmetricKeyEpochCache(b"cache for epoch 0".to_vec());
        let user_cache_1 = SymmetricKeyEpochCache(b"cache for epoch 1".to_vec());

        for caller in participants.iter().copied() {
            // Create cache for epoch 0
            env.update::<Result<(), String>>(
                caller,
                "update_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0), user_cache_0.clone())).unwrap(),
            )
            .unwrap();

            // Verify cache exists for epoch 0
            let result = env.update::<Result<Option<SymmetricKeyEpochCache>, String>>(
                caller,
                "get_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
            );
            assert_eq!(result, Ok(Some(user_cache_0.clone())));

            // Verify no cache exists for epoch 1
            let result = env.update::<Result<Option<SymmetricKeyEpochCache>, String>>(
                caller,
                "get_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(1))).unwrap(),
            );
            assert_eq!(
                result,
                Err(format!(
                    "vetKey epoch {:?} not found for chat {chat_id:?}",
                    VetKeyEpochId(1),
                ))
            );
        }

        // Rotate to epoch 1
        let new_epoch = env
            .update::<Result<VetKeyEpochId, String>>(
                env.principal_0,
                "rotate_chat_vetkey",
                encode_args((chat_id,)).unwrap(),
            )
            .unwrap();
        assert_eq!(new_epoch, VetKeyEpochId(1));

        for caller in participants.iter().copied() {
            // Create cache for epoch 1
            env.update::<Result<(), String>>(
                caller,
                "update_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(1), user_cache_1.clone())).unwrap(),
            )
            .unwrap();

            // Verify cache still exists for epoch 0
            let result = env.update::<Result<Option<SymmetricKeyEpochCache>, String>>(
                caller,
                "get_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
            );
            assert_eq!(result, Ok(Some(user_cache_0.clone())));

            // Verify cache exists for epoch 1
            let result = env.update::<Result<Option<SymmetricKeyEpochCache>, String>>(
                caller,
                "get_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(1))).unwrap(),
            );
            assert_eq!(result, Ok(Some(user_cache_1.clone())));
        }
    }
}

#[test]
fn modify_chat_participants() {
    let sorted_principals = |mut principals: Vec<Principal>| {
        principals.sort();
        principals
    };

    let mut rng = reproducible_rng();

    let env = TestEnvironment::new(&mut rng);
    let principal_0 = env.principal_0;
    let principal_1 = env.principal_1;
    let principal_2 = env.principal_2;
    let principal_3 = random_self_authenticating_principal(&mut rng);
    let principal_4 = random_self_authenticating_principal(&mut rng);

    let symmetric_key_rotation_duration_minutes = Time(1_000);
    let symmetric_key_rotation_duration =
        Time(NANOSECONDS_IN_MINUTE * symmetric_key_rotation_duration_minutes.0);

    let group_metadata = env
        .update::<Result<GroupChatMetadata, String>>(
            principal_0,
            "create_group_chat",
            encode_args((
                vec![principal_1],
                symmetric_key_rotation_duration_minutes,
                Time(10_000),
            ))
            .unwrap(),
        )
        .unwrap();

    let chat_id = ChatId::Group(group_metadata.chat_id);

    {
        let group_metadata = env
            .query::<Result<VetKeyEpochMetadata, String>>(
                principal_0,
                "get_latest_chat_vetkey_epoch_metadata",
                encode_args((chat_id,)).unwrap(),
            )
            .unwrap();
        assert_eq!(
            group_metadata,
            VetKeyEpochMetadata {
                epoch_id: VetKeyEpochId(0),
                participants: sorted_principals(vec![principal_0, principal_1]),
                creation_timestamp: Time(env.pic.get_time().as_nanos_since_unix_epoch()),
                symmetric_key_rotation_duration,
            }
        );
    }

    let add_participants = vec![principal_2, principal_3];
    let remove_participants: Vec<Principal> = vec![];
    let result = env.update::<Result<VetKeyEpochId, String>>(
        principal_0,
        "modify_group_chat_participants",
        encode_args((
            group_metadata.chat_id,
            GroupModification {
                add_participants: add_participants.clone(),
                remove_participants: remove_participants.clone(),
            },
        ))
        .unwrap(),
    );
    assert_eq!(result, Ok(VetKeyEpochId(1)));
    {
        let group_metadata = env
            .query::<Result<VetKeyEpochMetadata, String>>(
                principal_0,
                "get_latest_chat_vetkey_epoch_metadata",
                encode_args((chat_id,)).unwrap(),
            )
            .unwrap();
        assert_eq!(
            group_metadata,
            VetKeyEpochMetadata {
                epoch_id: VetKeyEpochId(1),
                participants: sorted_principals(vec![
                    principal_0,
                    principal_1,
                    principal_2,
                    principal_3
                ]),
                creation_timestamp: Time(env.pic.get_time().as_nanos_since_unix_epoch()),
                symmetric_key_rotation_duration,
            }
        );
    }

    let add_participants: Vec<Principal> = vec![];
    let remove_participants = vec![principal_1, principal_2];
    let result = env.update::<Result<VetKeyEpochId, String>>(
        principal_0,
        "modify_group_chat_participants",
        encode_args((
            group_metadata.chat_id,
            GroupModification {
                add_participants: add_participants.clone(),
                remove_participants: remove_participants.clone(),
            },
        ))
        .unwrap(),
    );
    assert_eq!(result, Ok(VetKeyEpochId(2)));
    {
        let group_metadata = env
            .query::<Result<VetKeyEpochMetadata, String>>(
                principal_0,
                "get_latest_chat_vetkey_epoch_metadata",
                encode_args((chat_id,)).unwrap(),
            )
            .unwrap();
        assert_eq!(
            group_metadata,
            VetKeyEpochMetadata {
                epoch_id: VetKeyEpochId(2),
                participants: sorted_principals(vec![principal_0, principal_3]),
                creation_timestamp: Time(env.pic.get_time().as_nanos_since_unix_epoch()),
                symmetric_key_rotation_duration,
            }
        );
    }

    let add_participants: Vec<Principal> = vec![principal_1, principal_2];
    let remove_participants = vec![principal_3];
    let result = env.update::<Result<VetKeyEpochId, String>>(
        principal_0,
        "modify_group_chat_participants",
        encode_args((
            group_metadata.chat_id,
            GroupModification {
                add_participants: add_participants.clone(),
                remove_participants: remove_participants.clone(),
            },
        ))
        .unwrap(),
    );
    assert_eq!(result, Ok(VetKeyEpochId(3)));
    {
        let group_metadata = env
            .query::<Result<VetKeyEpochMetadata, String>>(
                principal_0,
                "get_latest_chat_vetkey_epoch_metadata",
                encode_args((chat_id,)).unwrap(),
            )
            .unwrap();
        assert_eq!(
            group_metadata,
            VetKeyEpochMetadata {
                epoch_id: VetKeyEpochId(3),
                participants: sorted_principals(vec![principal_0, principal_1, principal_2]),
                creation_timestamp: Time(env.pic.get_time().as_nanos_since_unix_epoch()),
                symmetric_key_rotation_duration,
            }
        );
    }

    // 2. Unauthorized user (principal_4, not a member) tries to add principal_4
    let add_participants = vec![principal_4];
    let remove_participants: Vec<Principal> = vec![];
    let result = env.update::<Result<VetKeyEpochId, String>>(
        principal_4,
        "modify_group_chat_participants",
        encode_args((
            group_metadata.chat_id,
            GroupModification {
                add_participants: add_participants.clone(),
                remove_participants: remove_participants.clone(),
            },
        ))
        .unwrap(),
    );
    assert_eq!(
        result,
        Err(format!(
            "User {principal_4} does not have access to chat {:?} at epoch {:?}",
            chat_id,
            VetKeyEpochId(3)
        ))
    );

    // 2b. Unauthorized user (principal_4) tries to remove principal_0
    let add_participants: Vec<Principal> = vec![];
    let remove_participants = vec![principal_0];
    let result = env.update::<Result<VetKeyEpochId, String>>(
        principal_4,
        "modify_group_chat_participants",
        encode_args((
            group_metadata.chat_id,
            GroupModification {
                add_participants,
                remove_participants,
            },
        ))
        .unwrap(),
    );
    assert_eq!(
        result,
        Err(format!(
            "User {principal_4} does not have access to chat {:?} at epoch {:?}",
            chat_id,
            VetKeyEpochId(3)
        ))
    );
}

fn reproducible_rng() -> ChaCha20Rng {
    let mut seed = [0u8; 32];
    rand::rng().fill(&mut seed);
    let rng = ChaCha20Rng::from_seed(seed);
    println!("{seed:?}");
    rng
}

fn random_self_authenticating_principal<R: Rng + CryptoRng>(rng: &mut R) -> Principal {
    let fake_pk = random_bytes(32, rng);
    Principal::self_authenticating(&fake_pk)
}

fn random_bytes<R: Rng + CryptoRng>(size: usize, rng: &mut R) -> Vec<u8> {
    let mut buf = vec![0; size];
    rng.fill_bytes(&mut buf);
    buf
}

struct TestEnvironment {
    pic: PocketIc,
    canister_id: Principal,
    principal_0: Principal,
    principal_1: Principal,
    principal_2: Principal,
}

impl TestEnvironment {
    fn new<R: Rng + CryptoRng>(rng: &mut R) -> Self {
        let pic = PocketIcBuilder::new()
            .with_application_subnet()
            .with_ii_subnet()
            .with_fiduciary_subnet()
            .with_nonmainnet_features(true)
            .build();

        let canister_id = pic.create_canister();
        pic.add_cycles(canister_id, 2_000_000_000_000);

        let wasm_bytes = load_canister_wasm();
        pic.install_canister(
            canister_id,
            wasm_bytes,
            encode_one("dfx_test_key").unwrap(),
            None,
        );

        // Make sure the canister is properly initialized
        fast_forward(&pic, 5);

        Self {
            pic,
            canister_id,
            principal_0: random_self_authenticating_principal(rng),
            principal_1: random_self_authenticating_principal(rng),
            principal_2: random_self_authenticating_principal(rng),
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

    fn query<T: CandidType + for<'de> candid::Deserialize<'de>>(
        &self,
        caller: Principal,
        method_name: &str,
        args: Vec<u8>,
    ) -> T {
        let reply = self
            .pic
            .query_call(self.canister_id, caller, method_name, args);
        match reply {
            Ok(data) => decode_one(&data).expect("failed to decode reply"),
            Err(user_error) => panic!("canister returned a user error: {user_error}"),
        }
    }
}

fn fast_forward(ic: &PocketIc, ticks: u64) {
    for _ in 0..ticks - 1 {
        ic.tick();
    }
}

fn load_canister_wasm() -> Vec<u8> {
    let wasm_path_string = match std::env::var("CUSTOM_WASM_PATH") {
        Ok(path) if !path.is_empty() => path,
        _ => format!(
            "{}/examples/encrypted_chat/rust/target/wasm32-unknown-unknown/release/ic_vetkeys_example_encrypted_chat_backend.wasm",
            git_root_dir()
        ),
    };
    let wasm_path = Path::new(&wasm_path_string);
    std::fs::read(wasm_path)
        .expect("wasm does not exist - run `cargo build --release --target wasm32-unknown-unknown`")
}

pub fn git_root_dir() -> String {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .expect("Failed to execute git command");
    assert!(output.status.success());
    let root_dir_with_newline =
        String::from_utf8(output.stdout).expect("Failed to convert stdout to string");
    root_dir_with_newline.trim_end_matches('\n').to_string()
}
