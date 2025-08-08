use candid::{decode_one, encode_args, encode_one, CandidType, Principal};
use ic_vetkeys_example_encrypted_chat_backend::types::{
    ChatId, ChatMessageId, DirectChatId, EncryptedMessage, EncryptedMessageMetadata,
    EncryptedSymmetricKeyEpochCache, IbeEncryptedVetKey, SenderMessageId, SymmetricKeyEpochId,
    Time, UserMessage, VetKeyEpochId,
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

    let p0_self_chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_0)));
    let p0_p1_chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    for p in [env.principal_0, env.principal_1] {
        assert_eq!(
            env.query::<Vec<(ChatId, ChatMessageId)>>(
                p,
                "get_my_chat_ids",
                encode_args(()).unwrap()
            ),
            vec![]
        );
    }

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_0, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_ids: Vec<(ChatId, ChatMessageId)> =
        env.query(env.principal_0, "get_my_chat_ids", encode_args(()).unwrap());
    assert_eq!(chat_ids, vec![(p0_self_chat_id, ChatMessageId(0))]);

    assert_eq!(
        env.query::<Vec<(ChatId, ChatMessageId)>>(
            env.principal_1,
            "get_my_chat_ids",
            encode_args(()).unwrap()
        ),
        vec![]
    );

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    assert_eq!(
        env.query::<Vec<(ChatId, ChatMessageId)>>(
            env.principal_1,
            "get_my_chat_ids",
            encode_args(()).unwrap()
        ),
        vec![(p0_p1_chat_id, ChatMessageId(0))]
    );

    let chat_ids: Vec<(ChatId, ChatMessageId)> =
        env.query(env.principal_0, "get_my_chat_ids", encode_args(()).unwrap());
    assert!(chat_ids.contains(&(p0_self_chat_id, ChatMessageId(0))));
    assert!(chat_ids.contains(&(p0_p1_chat_id, ChatMessageId(0))));
    assert_eq!(chat_ids.len(), 2);
}

#[test]
fn fails_to_create_chat_with_same_participants_more_than_once() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_0, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    for _ in 0..3 {
        assert_eq!(
            env.update::<Result<Time, String>>(
                env.principal_0,
                "create_direct_chat",
                encode_args((env.principal_0, Time(1_000), Time(10_000))).unwrap(),
            ),
            Err(format!(
                "Chat {:?} already exists",
                ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_0)))
            ))
        );
    }
}

#[test]
fn can_send_and_get_messages() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let message_content = b"dummy encrypted message".to_vec();

    let mut message_id_counters =
        std::collections::BTreeMap::from([(env.principal_0, 0), (env.principal_1, 0)]);

    let mut expected_chat_history = vec![];

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    for caller in [env.principal_0, env.principal_1].iter().copied() {
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
        for sender in [env.principal_0, env.principal_1].iter().copied() {
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
                    "send_direct_message",
                    encode_args((
                        user_message,
                        if sender == env.principal_0 {
                            env.principal_1
                        } else {
                            env.principal_0
                        },
                    ))
                    .unwrap(),
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

            for caller in [env.principal_0, env.principal_1].iter().copied() {
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

#[test]
fn fails_to_send_messages_with_wrong_symmetric_key_epoch() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let symmetric_key_rotation_minutes = Time(1_000);
    let chat_message_expiration_minutes = Time(10_000);

    let chat_creation_time = env
        .update::<Result<Time, String>>(
            env.principal_0,
            "create_direct_chat",
            encode_args((
                env.principal_1,
                symmetric_key_rotation_minutes,
                chat_message_expiration_minutes,
            ))
            .unwrap(),
        )
        .unwrap();

    let message_content = b"dummy encrypted message".to_vec();
    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    // check that epoch 1 fails while we have epoch 0
    for i in 0..2 {
        for sender in [env.principal_0, env.principal_1].iter().copied() {
            let symmetric_key_epoch = SymmetricKeyEpochId(1);
            let user_message = UserMessage {
                content: message_content.clone(),
                vetkey_epoch: VetKeyEpochId(0),
                symmetric_key_epoch,
                message_id: SenderMessageId(0),
            };

            let result = env.update::<Result<Time, String>>(
                sender,
                "send_direct_message",
                encode_args((
                    user_message,
                    if sender == env.principal_0 {
                        env.principal_1
                    } else {
                        env.principal_0
                    },
                ))
                .unwrap(),
            );

            assert_eq!(
                result,
                Err(
                    format!(
                        "Wrong symmetric key epoch {} is not yet active, current time is {} and epoch start is {}",
                        symmetric_key_epoch.0,
                        env.pic.get_time().as_nanos_since_unix_epoch(),
                        chat_creation_time.0 + symmetric_key_epoch.0 * symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
                    )
                )
            );
        }

        // set time to 2 ns before the change to epoch 1
        if i == 0 {
            env.pic
                .set_time(pocket_ic::Time::from_nanos_since_unix_epoch(
                    chat_creation_time.0 + symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
                        - 2,
                ));
        }
    }

    // check that epoch 0 and 2 fails while we have epoch 1
    for i in 0..2 {
        for sender in [env.principal_0, env.principal_1].iter().copied() {
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
                    "send_direct_message",
                    encode_args((
                        user_message,
                        if sender == env.principal_0 {
                            env.principal_1
                        } else {
                            env.principal_0
                        },
                    ))
                    .unwrap(),
                );

                assert_eq!(
                result,
                Err(
                    format!(
                        "Wrong symmetric key epoch: epoch {} is expired, current time is {} and epoch end is {}",
                        symmetric_key_epoch.0,
                        env.pic.get_time().as_nanos_since_unix_epoch(),
                        chat_creation_time.0 + symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
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
                    "send_direct_message",
                    encode_args((
                        user_message,
                        if sender == env.principal_0 {
                            env.principal_1
                        } else {
                            env.principal_0
                        },
                    ))
                    .unwrap(),
                );

                assert_eq!(
                result,
                Err(
                    format!(
                        "Wrong symmetric key epoch {} is not yet active, current time is {} and epoch start is {}",
                        symmetric_key_epoch.0,
                        env.pic.get_time().as_nanos_since_unix_epoch(),
                        chat_creation_time.0 + symmetric_key_epoch.0 * symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
                    )
                )
            );
            }
        }

        // set time to 4 ns before the change to epoch 2
        if i == 0 {
            env.pic
                .set_time(pocket_ic::Time::from_nanos_since_unix_epoch(
                    chat_creation_time.0
                        + 2 * symmetric_key_rotation_minutes.0 * NANOSECONDS_IN_MINUTE
                        - 4,
                ));
        }
    }

    // sanity check that no messages were added
    for caller in [env.principal_0, env.principal_1].iter().copied() {
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

#[test]
fn can_get_vetkey_for_chat() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();
    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    // DON'T REUSE THE SAME TRANSPORT KEYS IN PRODUCTION
    let transport_key = ic_vetkeys::TransportSecretKey::from_seed(random_bytes(32, rng)).unwrap();

    let mut raw_encrypted_vetkeys = std::collections::BTreeMap::new();

    for latest_epoch in 0..3 {
        for caller in [env.principal_0, env.principal_1] {
            for epoch in 0..=latest_epoch {
                for vetkey_epoch_id in [Option::<VetKeyEpochId>::None, Some(VetKeyEpochId(epoch))] {
                    if vetkey_epoch_id.is_none() && epoch != latest_epoch {
                        continue;
                    }

                    let raw_encrypted_vetkey = env
                        .update::<Result<serde_bytes::ByteBuf, String>>(
                            caller,
                            "derive_chat_vetkey",
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
                "chat_public_key",
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

#[test]
fn public_keys_for_different_chats_and_epochs_are_different() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let chat_id_0 = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));
    let chat_id_1 = ChatId::Direct(DirectChatId::new((env.principal_1, env.principal_2)));

    // we can get public key for any chats, also non-existing ones
    let raw_public_key_00 = env
        .update::<serde_bytes::ByteBuf>(
            env.principal_0,
            "chat_public_key",
            encode_args((chat_id_0, VetKeyEpochId(0))).unwrap(),
        )
        .into_vec();

    let raw_public_key_01 = env
        .update::<serde_bytes::ByteBuf>(
            env.principal_0,
            "chat_public_key",
            encode_args((chat_id_0, VetKeyEpochId(1))).unwrap(),
        )
        .into_vec();

    let raw_public_key_10 = env
        .update::<serde_bytes::ByteBuf>(
            env.principal_0,
            "chat_public_key",
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

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    let result = env.update::<Result<serde_bytes::ByteBuf, String>>(
        env.principal_2,
        "derive_chat_vetkey",
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
            env.principal_2,
            VetKeyEpochId(0)
        ))
    );
}

#[test]
fn fails_to_send_messages_with_wrong_vetkey_epoch() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let symmetric_key_rotation_minutes = Time(1_000);
    let chat_message_expiration_minutes = Time(10_000);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((
            env.principal_1,
            symmetric_key_rotation_minutes,
            chat_message_expiration_minutes,
        ))
        .unwrap(),
    )
    .unwrap();

    let message_content = b"dummy encrypted message".to_vec();
    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    // Start with using epoch 1 before it's been rotated to (should fail)
    for latest_epoch in 0..3 {
        for sender in [env.principal_0, env.principal_1].iter().copied() {
            let user_message = UserMessage {
                content: message_content.clone(),
                vetkey_epoch: VetKeyEpochId(latest_epoch + 1),
                symmetric_key_epoch: SymmetricKeyEpochId(0),
                message_id: SenderMessageId(0),
            };

            let result = env.update::<Result<Time, String>>(
                sender,
                "send_direct_message",
                encode_args((
                    user_message,
                    if sender == env.principal_0 {
                        env.principal_1
                    } else {
                        env.principal_0
                    },
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

    // sanity check that no messages were added
    for caller in [env.principal_0, env.principal_1].iter().copied() {
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

#[test]
fn fails_to_derive_vetkey_with_wrong_vetkey_epoch() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let transport_key = ic_vetkeys::TransportSecretKey::from_seed(random_bytes(32, rng)).unwrap();

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    // Use epoch 1 before it's been rotated to
    for latest_epoch in 0..3 {
        for caller in [env.principal_0, env.principal_1] {
            let result = env.update::<Result<serde_bytes::ByteBuf, String>>(
                caller,
                "derive_chat_vetkey",
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

#[test]
fn can_rotate_chat_vetkey() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    // Initially, epoch 0 should be the latest (we can verify this by trying to use epoch 1)
    let result = env.update::<Result<serde_bytes::ByteBuf, String>>(
        env.principal_0,
        "derive_chat_vetkey",
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

    // Rotate to epoch 2
    let new_epoch = env
        .update::<Result<VetKeyEpochId, String>>(
            env.principal_0,
            "rotate_chat_vetkey",
            encode_args((chat_id,)).unwrap(),
        )
        .unwrap();
    assert_eq!(new_epoch, VetKeyEpochId(2));

    // Both participants should be able to rotate
    let new_epoch = env
        .update::<Result<VetKeyEpochId, String>>(
            env.principal_1,
            "rotate_chat_vetkey",
            encode_args((chat_id,)).unwrap(),
        )
        .unwrap();
    assert_eq!(new_epoch, VetKeyEpochId(3));
}

#[test]
fn unauthorized_user_cannot_rotate_chat_vetkey() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    let result = env.update::<Result<VetKeyEpochId, String>>(
        env.principal_2,
        "rotate_chat_vetkey",
        encode_args((chat_id,)).unwrap(),
    );

    assert_eq!(
        result,
        Err(format!(
            "User {} does not have access to chat {chat_id:?} at epoch {:?}",
            env.principal_2,
            VetKeyEpochId(0)
        ))
    );
}

#[test]
fn can_update_and_get_symmetric_key_cache() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));
    let cache_data = b"dummy symmetric key cache".to_vec();
    let user_cache = EncryptedSymmetricKeyEpochCache(cache_data.clone());

    // Initially, cache should be empty for both participants
    for caller in [env.principal_0, env.principal_1] {
        assert_eq!(
            env.update::<Result<Option<EncryptedSymmetricKeyEpochCache>, String>>(
                caller,
                "get_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
            ),
            Ok(None)
        );
    }

    // Authorized user can create cache
    for caller in [env.principal_0, env.principal_1] {
        let result = env.update::<Result<(), String>>(
            caller,
            "update_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
        );
        assert_eq!(result, Ok(()));
    }

    // Authorized user can retrieve their cache
    for caller in [env.principal_0, env.principal_1] {
        let result = env.update::<Result<Option<EncryptedSymmetricKeyEpochCache>, String>>(
            caller,
            "get_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
        );
        assert_eq!(result, Ok(Some(user_cache.clone())));
    }

    // Authorized user can update their cache
    let updated_cache_data = b"updated symmetric key cache".to_vec();
    let updated_user_cache = EncryptedSymmetricKeyEpochCache(updated_cache_data.clone());

    for caller in [env.principal_0, env.principal_1] {
        let result = env.update::<Result<(), String>>(
            caller,
            "update_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0), updated_user_cache.clone())).unwrap(),
        );
        assert_eq!(result, Ok(()));
    }

    // Verify the cache was updated
    for caller in [env.principal_0, env.principal_1] {
        let result = env.update::<Result<Option<EncryptedSymmetricKeyEpochCache>, String>>(
            caller,
            "get_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
        );
        assert_eq!(result, Ok(Some(updated_user_cache.clone())));
    }
}

#[test]
fn unauthorized_user_cannot_access_symmetric_key_cache() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));
    let cache_data = b"dummy symmetric key cache".to_vec();
    let user_cache = EncryptedSymmetricKeyEpochCache(cache_data);

    // Unauthorized user cannot update cache
    let result = env.update::<Result<(), String>>(
        env.principal_2,
        "update_my_symmetric_key_cache",
        encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
    );
    assert_eq!(
        result,
        Err(format!(
            "User {} does not have access to chat {chat_id:?} at epoch {:?}",
            env.principal_2,
            VetKeyEpochId(0)
        ))
    );

    // Unauthorized user cannot get cache
    let result = env.update::<Result<Option<EncryptedSymmetricKeyEpochCache>, String>>(
        env.principal_2,
        "get_my_symmetric_key_cache",
        encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
    );
    assert_eq!(
        result,
        Err(format!(
            "User {} does not have access to chat {chat_id:?} at epoch {:?}",
            env.principal_2,
            VetKeyEpochId(0)
        ))
    );
}

#[test]
fn cannot_access_cache_after_vetkey_epoch_expires() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let expiry_setting_minutes = 10_000;

    let chat_creation_time = env
        .update::<Result<Time, String>>(
            env.principal_0,
            "create_direct_chat",
            encode_args((env.principal_1, Time(1_000), Time(expiry_setting_minutes))).unwrap(),
        )
        .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));
    let cache_data = b"dummy symmetric key cache".to_vec();
    let user_cache = EncryptedSymmetricKeyEpochCache(cache_data.clone());

    // Create cache for epoch 0
    for caller in [env.principal_0, env.principal_1] {
        env.update::<Result<(), String>>(
            caller,
            "update_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
        )
        .unwrap();
    }

    let expiry_time = chat_creation_time.0 + expiry_setting_minutes * NANOSECONDS_IN_MINUTE;
    // Fast forward time to expire epoch 0
    env.pic
        .set_time(pocket_ic::Time::from_nanos_since_unix_epoch(expiry_time));

    // Neither authorized nor unauthorized users can access expired epoch cache
    for caller in [env.principal_0, env.principal_1] {
        // Cannot update cache for expired epoch
        let result = env.update::<Result<(), String>>(
            caller,
            "update_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
        );
        assert_eq!(
            result,
            Err(format!("vetKey epoch {:?} expired", VetKeyEpochId(0),))
        );

        // Cannot get cache for expired epoch
        let result = env.update::<Result<Option<EncryptedSymmetricKeyEpochCache>, String>>(
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

#[test]
fn cannot_derive_vetkey_after_cache_exists() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));
    let cache_data = b"dummy symmetric key cache".to_vec();
    let user_cache = EncryptedSymmetricKeyEpochCache(cache_data.clone());

    // DON'T REUSE THE SAME TRANSPORT KEYS IN PRODUCTION
    let transport_key = ic_vetkeys::TransportSecretKey::from_seed(random_bytes(32, rng)).unwrap();

    for caller in [env.principal_0, env.principal_1] {
        // Create cache
        env.update::<Result<(), String>>(
            caller,
            "update_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
        )
        .unwrap();

        // Now derive_vetkey should fail
        let result = env.update::<Result<serde_bytes::ByteBuf, String>>(
            caller,
            "derive_chat_vetkey",
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

#[test]
fn cache_is_separate_for_different_epochs() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));
    let user_cache_0 = EncryptedSymmetricKeyEpochCache(b"cache for epoch 0".to_vec());
    let user_cache_1 = EncryptedSymmetricKeyEpochCache(b"cache for epoch 1".to_vec());

    for caller in [env.principal_0, env.principal_1] {
        // Create cache for epoch 0
        env.update::<Result<(), String>>(
            caller,
            "update_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0), user_cache_0.clone())).unwrap(),
        )
        .unwrap();

        // Verify cache exists for epoch 0
        let result = env.update::<Result<Option<EncryptedSymmetricKeyEpochCache>, String>>(
            caller,
            "get_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
        );
        assert_eq!(result, Ok(Some(user_cache_0.clone())));

        // Verify no cache exists for epoch 1
        let result = env.update::<Result<Option<EncryptedSymmetricKeyEpochCache>, String>>(
            caller,
            "get_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(1))).unwrap(),
        );
        assert_eq!(
            result,
            Err(format!(
                "vetKey epoch {:?} not found for chat {chat_id:?}",
                VetKeyEpochId(1)
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

    for caller in [env.principal_0, env.principal_1] {
        // Create cache for epoch 1
        env.update::<Result<(), String>>(
            caller,
            "update_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(1), user_cache_1.clone())).unwrap(),
        )
        .unwrap();

        // Verify cache still exists for epoch 0
        let result = env.update::<Result<Option<EncryptedSymmetricKeyEpochCache>, String>>(
            caller,
            "get_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
        );
        assert_eq!(result, Ok(Some(user_cache_0.clone())));

        // Verify cache exists for epoch 1
        let result = env.update::<Result<Option<EncryptedSymmetricKeyEpochCache>, String>>(
            caller,
            "get_my_symmetric_key_cache",
            encode_args((chat_id, VetKeyEpochId(1))).unwrap(),
        );
        assert_eq!(result, Ok(Some(user_cache_1.clone())));
    }
}

#[test]
fn can_reshare_vetkey() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    let reshared_vetkey = b"dummy_encrypted_vetkey".to_vec();

    env.update::<Result<(), String>>(
        env.principal_0,
        "reshare_ibe_encrypted_vetkeys",
        encode_args((
            chat_id,
            VetKeyEpochId(0),
            vec![(env.principal_1, IbeEncryptedVetKey(reshared_vetkey.clone()))],
        ))
        .unwrap(),
    )
    .unwrap();

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_1,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
    );

    assert_eq!(result, Ok(Some(IbeEncryptedVetKey(reshared_vetkey))));
}

#[test]
fn reshared_vetkey_is_deleted_and_rejected_after_user_uploads_cache() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();
    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    env.update::<Result<(), String>>(
        env.principal_0,
        "reshare_ibe_encrypted_vetkeys",
        encode_args((
            chat_id,
            VetKeyEpochId(0),
            vec![(
                env.principal_1,
                IbeEncryptedVetKey(b"dummy_encrypted_vetkey".to_vec()),
            )],
        ))
        .unwrap(),
    )
    .unwrap();

    let user_cache = EncryptedSymmetricKeyEpochCache(b"dummy symmetric key cache".to_vec());
    let result = env.update::<Result<(), String>>(
        env.principal_1,
        "update_my_symmetric_key_cache",
        encode_args((chat_id, VetKeyEpochId(0), user_cache.clone())).unwrap(),
    );
    assert_eq!(result, Ok(()));

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_1,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
    );

    assert_eq!(result, Ok(None));

    let result = env.update::<Result<(), String>>(
        env.principal_1,
        "reshare_ibe_encrypted_vetkeys",
        encode_args((
            chat_id,
            VetKeyEpochId(0),
            vec![(
                env.principal_1,
                IbeEncryptedVetKey(b"dummy_encrypted_vetkey".to_vec()),
            )],
        ))
        .unwrap(),
    );
    assert_eq!(
        result,
        Err(format!(
            "User {} already has a cached key for chat {chat_id:?} at vetkey epoch {:?}",
            env.principal_1,
            VetKeyEpochId(0)
        ))
    );
}

#[test]
fn cannot_reshare_vetkey_twice() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    let reshared_vetkey = b"dummy_encrypted_vetkey".to_vec();

    env.update::<Result<(), String>>(
        env.principal_0,
        "reshare_ibe_encrypted_vetkeys",
        encode_args((
            chat_id,
            VetKeyEpochId(0),
            vec![(env.principal_1, IbeEncryptedVetKey(reshared_vetkey.clone()))],
        ))
        .unwrap(),
    )
    .unwrap();

    assert_eq!(
        env.update::<Result<(), String>>(
            env.principal_0,
            "reshare_ibe_encrypted_vetkeys",
            encode_args((
                chat_id,
                VetKeyEpochId(0),
                vec![(
                    env.principal_1,
                    IbeEncryptedVetKey(b"dummy_encrypted_vetkey_2".to_vec())
                )],
            ))
            .unwrap(),
        ),
        Err(format!(
            "User {} already has a reshared key for chat {chat_id:?} at vetkey epoch {:?}",
            env.principal_1,
            VetKeyEpochId(0)
        ))
    );

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_1,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
    );

    assert_eq!(result, Ok(Some(IbeEncryptedVetKey(reshared_vetkey))));
}

#[test]
fn fails_to_reshare_vetkey_if_unauthorized() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    let reshared_vetkey = b"dummy_encrypted_vetkey".to_vec();

    assert_eq!(
        env.update::<Result<(), String>>(
            env.principal_2,
            "reshare_ibe_encrypted_vetkeys",
            encode_args((
                chat_id,
                VetKeyEpochId(0),
                vec![(env.principal_1, IbeEncryptedVetKey(reshared_vetkey.clone()))],
            ))
            .unwrap(),
        ),
        Err(format!(
            "User {} does not have access to chat {chat_id:?} at epoch {:?}",
            env.principal_2,
            VetKeyEpochId(0)
        ))
    );

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_0,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
    );

    assert_eq!(result, Ok(None));
}

#[test]
fn fails_to_reshare_vetkey_with_oneself() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(1_000), Time(10_000))).unwrap(),
    )
    .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    let reshared_vetkey = b"dummy_encrypted_vetkey".to_vec();

    assert_eq!(
        env.update::<Result<(), String>>(
            env.principal_0,
            "reshare_ibe_encrypted_vetkeys",
            encode_args((
                chat_id,
                VetKeyEpochId(0),
                vec![(env.principal_0, IbeEncryptedVetKey(reshared_vetkey.clone()))],
            ))
            .unwrap(),
        ),
        Err(format!(
            "User {} cannot reshare a vetkey with themselves",
            env.principal_0
        ))
    );

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_0,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
    );

    assert_eq!(result, Ok(None));
}

#[test]
fn fails_to_reshare_or_get_reshared_vetkeys_for_invalid_vetkey_epochs() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let message_expiry_time_minutes = Time(10_000);

    let chat_creation_time = env
        .update::<Result<Time, String>>(
            env.principal_0,
            "create_direct_chat",
            encode_args((env.principal_1, Time(1_000), message_expiry_time_minutes)).unwrap(),
        )
        .unwrap();

    let chat_id = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));

    let reshared_vetkey = b"dummy_encrypted_vetkey".to_vec();

    assert_eq!(
        env.update::<Result<(), String>>(
            env.principal_0,
            "reshare_ibe_encrypted_vetkeys",
            encode_args((
                chat_id,
                VetKeyEpochId(1),
                vec![(env.principal_1, IbeEncryptedVetKey(reshared_vetkey.clone()))],
            ))
            .unwrap(),
        ),
        Err(format!(
            "vetKey epoch {:?} not found for chat {chat_id:?}",
            VetKeyEpochId(1)
        ))
    );

    env.update::<Result<(), String>>(
        env.principal_0,
        "reshare_ibe_encrypted_vetkeys",
        encode_args((
            chat_id,
            VetKeyEpochId(0),
            vec![(env.principal_1, IbeEncryptedVetKey(reshared_vetkey.clone()))],
        ))
        .unwrap(),
    )
    .unwrap();

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_1,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(1))).unwrap(),
    );

    assert_eq!(
        result,
        Err(format!(
            "vetKey epoch {:?} not found for chat {chat_id:?}",
            VetKeyEpochId(1)
        ))
    );

    let new_epoch = env
        .update::<Result<VetKeyEpochId, String>>(
            env.principal_0,
            "rotate_chat_vetkey",
            encode_args((chat_id,)).unwrap(),
        )
        .unwrap();
    assert_eq!(new_epoch, VetKeyEpochId(1));

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_1,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
    );

    assert_eq!(
        result,
        Ok(Some(IbeEncryptedVetKey(reshared_vetkey.clone())))
    );

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_1,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(2))).unwrap(),
    );

    assert_eq!(
        result,
        Err(format!(
            "vetKey epoch {:?} not found for chat {chat_id:?}",
            VetKeyEpochId(2)
        ))
    );

    env.pic
        .set_time(pocket_ic::Time::from_nanos_since_unix_epoch(
            chat_creation_time.0 + message_expiry_time_minutes.0 * NANOSECONDS_IN_MINUTE,
        ));

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_1,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(0))).unwrap(),
    );

    assert_eq!(
        result,
        Err(format!("vetKey epoch {:?} expired", VetKeyEpochId(0)))
    );

    env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_1,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(1))).unwrap(),
    )
    .unwrap();

    env.pic.advance_time(std::time::Duration::from_nanos(10));

    let result = env.update::<Result<Option<IbeEncryptedVetKey>, String>>(
        env.principal_1,
        "get_my_reshared_ibe_encrypted_vetkey",
        encode_args((chat_id, VetKeyEpochId(1))).unwrap(),
    );

    assert_eq!(
        result,
        Err(format!("vetKey epoch {:?} expired", VetKeyEpochId(1)))
    );

    for i in 0..2 {
        let result = env.update::<Result<(), String>>(
            env.principal_0,
            "reshare_ibe_encrypted_vetkeys",
            encode_args((
                chat_id,
                VetKeyEpochId(i),
                vec![(env.principal_1, IbeEncryptedVetKey(reshared_vetkey.clone()))],
            ))
            .unwrap(),
        );

        assert_eq!(
            result,
            Err(format!("vetKey epoch {:?} expired", VetKeyEpochId(i)))
        );
    }
}

#[test]
fn time_job_reports_cleaned_up_expired_items() {
    let rng = &mut reproducible_rng();
    let env = TestEnvironment::new(rng);

    let chat_id_01 = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_1)));
    let chat_id_02 = ChatId::Direct(DirectChatId::new((env.principal_0, env.principal_2)));
    let user_cache = EncryptedSymmetricKeyEpochCache(b"dummy_symmetric_key".to_vec());
    let dummy_encrypted_vetkey = IbeEncryptedVetKey(b"dummy_encrypted_vetkey".to_vec());

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_1, Time(30), Time(60))).unwrap(),
    )
    .unwrap();

    env.update::<Result<Time, String>>(
        env.principal_0,
        "create_direct_chat",
        encode_args((env.principal_2, Time(30), Time(60))).unwrap(),
    )
    .unwrap();

    for i in 0..2 {
        for j in 0..2 {
            let user_message = UserMessage {
                content: b"hello".to_vec(),
                vetkey_epoch: VetKeyEpochId(i),
                symmetric_key_epoch: SymmetricKeyEpochId(0),
                message_id: SenderMessageId(i + 2 * j),
            };
            env.update::<Result<Time, String>>(
                env.principal_0,
                "send_direct_message",
                encode_args((user_message.clone(), env.principal_1)).unwrap(),
            )
            .unwrap();
            env.update::<Result<Time, String>>(
                env.principal_0,
                "send_direct_message",
                encode_args((user_message.clone(), env.principal_2)).unwrap(),
            )
            .unwrap();
        }

        for (chat_id, receiver) in [(chat_id_01, env.principal_1), (chat_id_02, env.principal_2)] {
            env.update::<Result<(), String>>(
                env.principal_0,
                "update_my_symmetric_key_cache",
                encode_args((chat_id, VetKeyEpochId(i), user_cache.clone())).unwrap(),
            )
            .unwrap();

            env.update::<Result<(), String>>(
                env.principal_0,
                "reshare_ibe_encrypted_vetkeys",
                encode_args((
                    chat_id,
                    VetKeyEpochId(i),
                    vec![(receiver, dummy_encrypted_vetkey.clone())],
                ))
                .unwrap(),
            )
            .unwrap();

            if i == 0 {
                let new_epoch = env
                    .update::<Result<VetKeyEpochId, String>>(
                        env.principal_0,
                        "rotate_chat_vetkey",
                        encode_args((chat_id,)).unwrap(),
                    )
                    .unwrap();

                assert_eq!(new_epoch, VetKeyEpochId(1));
            }
        }
    }

    env.pic
        .advance_time(std::time::Duration::from_secs(24 * 3600));
    env.pic.tick();

    let logs = env
        .pic
        .fetch_canister_logs(env.canister_id, Principal::anonymous())
        .unwrap();
    let log_string = logs.iter().fold(String::new(), |acc, log| {
        format!("{acc}{}", String::from_utf8(log.content.clone()).unwrap())
    });
    assert_eq!(log_string, "Timer job: cleaned up 8 expired direct messages, 0 expired group messages, 4 expired vetkey epochs caches, 4 expired reshared vetkeys");
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
