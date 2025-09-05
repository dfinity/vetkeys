# vetKey Encrypted Chat

vetKey Encrypted Chat has two main components: the canister backend and user frontend.

## Features

* Messaging protected with end-to-end encryption.

* High security through symmetric ratchet and key rotation.

* Disappearing messages guaranteed by the canister (ICP smart contract) logic.

## Design

TODO: add information about the symmetric ratchet/vetKey rotation.

### State Recovery

TODO: explain what this it about and that it works via uploading encrypted user cache and disallowing to obtain the vetKey that was used to initialize the state.

## Components

vetKey Encrypted Chat consists of a backend canister on the ICP and a user frontend. 

The backend's responsibilities are:

* Providing APIs for chat interactions and key retrieval from vetKeys.

* Storing chat metadata and users' encrypted messages.

* Ordering of incoming messages.

* Validation of encryption key metadata correctness for incoming messages.

* Access control for user requests to both encryption keys and chat data.

* Cleanup of expired messages if message expiration is turned on in a chat.

* Storing user's encrypted key cache that allows the user to restore a former symmetric ratchet state in case of a state loss, e.g., upon browser change.

The frontend's responsibilities are:

* Providing a chat UI similar to Signal, WhatsApp, etc.

* Synchronizing metadata for accessible chats.

* Obtaining keys required for message encryption/decryption.

* Encrypting and sending outgoing messages.

* Fetching and decrypting incoming messages.

## Backend Canister Component

### Backend State

* Chat data

  * Chat IDs - each chat has a chat ID

  * vetKey epochs - each chat has one or more vetKey epochs

    * vetKey epoch ID for each vetKey epoch in the chat

    * Participants who have access to the chat at the vetKey epoch

    * Creation time of the vetKey epoch

    * Symmetric key ratchet rotation duration at the vetKey epoch

    * Message ID that the vetKey epoch starts with in the chat

  * Messages

    * Chat Message ID that is assigned by the canister

    * Nonce use for message encryption that is assigned by the user

    * Consensus time at message receival

    * vetKey epoch ID when the message was received

    * Encrypted bytes of the message content.

  * Message expiry

    * Number of expired messages in the chat

    * Message expiry setting - how long does it take for a message to expire

* User data per chat and vetKey epoch

  * [User-uploaded optional encrypted symmetric ratchet state cache](#state-cache)

  * Optional optimization: [IBE-encrypted vetKey reshared by another user](#ibe-encrypted-vetkey-resharing)

### Chat Creation

Upon receiving a call from the frontend to create a chat via one of the following APIs

```
type OtherParticipant = principal;
type TimeNanos = nat64;
type SymmetricKeyRotationMins = nat64;
type GroupChatId = nat64;
type GroupChatMetadata = record { creation_timestamp : TimeNanos; chat_id : GroupChatId };

create_direct_chat : (OtherParticipant, SymmetricKeyRotationMins) -> variant { Ok : TimeNanos; Err : text };
create_group_chat : (vec OtherParticipant, SymmetricKeyRotationMins) -> (variant { Ok : GroupChatMetadata; Err : text });
```

the backend does the following:

* Checks that a direct chat does not exist yet if `create_direct_chat` was called and returns an error if the check fails.

* Checks that `SymmetricKeyRotationMins` do not cause overflows in `nat64` types if converted to nanoseconds and returns an error if the check fails.

* Deduplicates group chat participants if `create_group_chat` was called.

* If all checks pass, adds the chat ID and users who have access to it to the state. The return value of `create_direct_chat` is the current consensus time indicating the chat creation time (which is required to correctly compute the symmetric key epoch that the frontend needs to encrypt messages with). The return value of `create_group_chat` is `GroupChatMetadata`, which contains the chat creation time as well as the group chat ID. The group chat ID does not depend on the caller's inputs (in contrast to direct chat IDs), and thus must be returned explicitly.

### Group Changes

Group changes in a group chat such as addition or removal of users can be triggered using the following backend canister API:
```
type GroupChatId = nat64;
type VetKeyEpochId = nat64;
type KeyRotationResult = variant { Ok : VetKeyEpochId; Err : text };
type GroupModification = record {
  remove_participants : vec principal;
  add_participants : vec principal;
};

modify_group_chat_participants : (GroupChatId, GroupModification) -> (KeyRotationResult);
```

The API takes in a group chat ID and a set of group changes.
When this API is triggered, the canister checks that:

* The group chat exists.

* The user has access to the group chat at the latest vetKey epoch.

* The user is authorized to make group changes. This is an implementation detail and is out of scope of this document. Authorizing users to make group changes can be performed via a separate API and can be implemented with different rules, e.g., admins can make changes, or more fine-grained access can be implemented such as admins, moderators, etc., or even every user can perform group changes.

* The passed `GroupModification` is valid:

  * `remove_participants` or `add_participants` is non-empty.

  * Every `principal` in `remove_participants` has access to the chat.

  * No `principal` in `add_participants` has access to the chat.

Note that the latter two points guarantee that there is no intersection between `remove_participants` and `add_participants`.

A group change triggers a vetKey epoch rotation that updates the set of group participants according to the passed `GroupModification` and stores it in the next vetKey epoch for the chat. The effects of vetKey epoch rotation are further discussed in a [separate section](#vetkey-epoch-rotation).

> [!NOTE]
> One call to `modify_group_chat_participants` triggers one vetKey epoch rotation even if multiple `principals` are added or removed. Further potential optimizations for reducing the number of vetKey epoch rotations or the number of vetKey retrievals are discussed in [Optimizations](#optimizations).

### Incoming Message Validation

Upon receival of a user message via one of the following APIs

```
type GroupChatId = nat64;
type ChatId = variant {
  Group : GroupChatId;
  Direct : record { principal; principal };
};
type VetKeyEpochId = nat64;
type EncryptedBytes = blob;
type SymmetricKeyEpochId = nat64;
type Nonce = blob;
type UserMessage = record {
  vetkey_epoch_id : VetKeyEpochId;
  content : EncryptedBytes;
  symmetric_key_epoch_id : SymmetricKeyEpochId;
  nonce : Nonce;
};
type MessagingError = variant { WrongVetKeyEpoch; WrongSymmetricKeyEpoch; Custom: text };

send_message : (ChatId, UserMessage) -> (variant { Ok; Err : MessageSendingError });
```

the canister validates the message metadata and ensures that the caller has access.

More specifically, the canister checks that:
* The caller has access to the chat at the passed `vetkey_epoch_id` or returns a `Custom` variant of `MessageSendingError` if the check fails.
* `vetkey_epoch_id` attached to the message is the latest for the chat ID or returns the `WrongVetKeyEpoch` variant of `MessageSendingError` if the check fails.
* `symmetric_key_epoch_id` attached to the message is equal to the [current symmetric key epoch ID](#calculating-current-symmetric-ratchet-epoch-id) corresponding the current consensus time. To check that, the canister calculates the current symmetric ratchet epoch ID for the chat and `vetkey_epoch_id`. If the check fails, the canister returns the `WrongSymmetricKeyEpoch` variant of `MessageSendingError` if the check fails.

TODO: can we use timestamps instead of `symmetric_key_epoch_id`s? Would that improve anything? 

> [!NOTE]
> This API assumes that the frontend's clock is reasonably synchronized with the ICP to encrypt the messages with the key from the right symmetric ratchet state. This does not pose a significant limitation, since 1) it must already be the case for facilitating reliable communication with the ICP in general and 2) re-encrypting and re-sending in case of failures can be done automatically by the frontend.

If the checks pass, the canister accepts the message, assigns to it:

* The current consensus time as its timestamp, which is needed for computing the message expiry but also to display the message arrival time in the chat UI.

* A chat message ID, which is unique and assigned from an incrementing counter starting from zero. Note that the current number of messages in the chat is different than the value of the counter if some messages have expired.

Finally, the canister adds the message to the state and returns an `Ok`.

### Exposing Metadata about Chats and New Messages

The backend canister exposees the following APIs for fetching metadata:

```
type GroupChatId = nat64;
type ChatId = variant {
  Group : GroupChatId;
  Direct : record { principal; principal };
};
type NumberOfMessages = nat64;
type ChatMetadata = record {
  chat_id : ChatId;
  number_of_messages : NumberOfMessages;
  vetkey_epoch_id : VetKeyEpochId;
};

type SymmetricKeyRotationMins = nat64;
type ChatMessageId = nat64;
type TimeNanos = nat64;
type VetKeyEpochId = nat64;
type VetKeyEpochMetadata = record {
  symmetric_key_rotation_duration : SymmetricKeyRotationMins;
  participants : vec principal;
  messages_start_with_id : ChatMessageId;
  creation_timestamp : TimeNanos;
  epoch_id : VetKeyEpochId;
};

get_my_chats_and_time : () -> (record { chats : vec ChatMetadata; consensus_time_now : TimeNanos }) query;
get_vetkey_epoch_metadata : (ChatId, VetKeyEpochId) -> (variant { Ok : VetKeyEpochMetadata; Err : text }) query;
```

* The `get_my_chats_and_time` API returns a vector of all chat IDs accessible to the user as well as their their current total number of messages and vetKey epoch ID. The frontend can detect new chats and new messages in existing chats by periodically querying `get_my_chats_and_time`. Also, this API returns the current consensus time, which is e.g. useful to compute the message expiry and to determine if symmetric ratchet states need to be evolved. The current total number of messages (`NumberOfMessages`) includes the messages in the accessible chat ID that are not accessible to the user. This can happen if some messages have expired or in group chats, where the user joined at a later point. If a user is [removed from a chat](#group-changes), the result of `get_my_chats_and_time` called by the user will not include that chat anymore. Note that the latter only leaks to the user how many messages were in the chat before the user joined.

* The `get_vetkey_epoch_metadata` API checks that the user has access to `ChatId` at `VetKeyEpochId` and if the test passes, the API returns the corresponding `VetKeyEpochMetadata` or an error otherwise.

> [!NOTE]
> This API is exposed as `query` and, therefore, requires handling of cases where a replica would return incorrect data. This is further discussed [Ensuring Correctness of Query Calls](#ensuring-correctness-of-query-calls).

### Encrypted Message Retrieval

To allow the frontend to retrieve encrypted messages, the backend canister exposes the following backend canister API:

```
type GroupChatId = nat64;
type ChatId = variant {
  Group : GroupChatId;
  Direct : record { principal; principal };
};
type ChatMessageId = nat64;
type Limit = nat32;
type EncryptedBytes = blob;
type EncryptedMessage = record {
  content : EncryptedBytes;
  metadata : EncryptedMessageMetadata;
};
type VetKeyEpochId = nat64;
type SymmetricKeyEpochId = nat64;
type TimeNanos = nat64;
type Nonce = blob;
type EncryptedMessageMetadata = record {
  vetkey_epoch : VetKeyEpochId;
  sender : principal;
  symmetric_key_epoch_id : SymmetricKeyEpochId;
  chat_message_id : ChatMessageId;
  timestamp : TimeNanos;
  nonce : Nonce;
};

get_messages : (ChatId, ChatMessageId, opt Limit) -> (
    vec EncryptedMessage,
  ) query;
```

The `get_messages` API takes in a chat ID, the first message ID to retrieve, and an optional limit value for the maximum number of messages to retrieve in this call.
The API returns a vector of `EncryptedMessage`s.
If the user does not have access to the chat or the chat does not exist, an empty vector is returned.
If the user does not have access to particular messages, e.g., if the user was [added to a group chat](#group-changes) after some activity, or if some of the messages [expired](#disappearing-messages), then those messages are skipped.

If a user is removed from a chat and afterwards the user is added to the chat again (with or without some messages being added in-between), the user will not have access to the messages that were visible before the user was removed from the chat.
This applies to any number of repetitions of this process.
That is, only the last range of messages without gaps is accessible to the user.
This also applies to other backend canister APIs that require the user to have access to a particular vetKey epoch such as vetKey epoch and encrypted user cache retrieval, and vetKey derivation.

> [!NOTE]
> This API is exposed as `query` and, therefore, requires handling of cases where a replica would return incorrect data. This is further discussed [Ensuring Correctness of Query Calls](#ensuring-correctness-of-query-calls).

### Providing vetKeys for Symmetric Ratchet Initialization

Symmetric ratchet state is initialized from a vetKey that is the same for all chat participants.
To fetch a vetKey, the user calls the following backend canister API:
```
type PublicTransportKey = blob;
type GroupChatId = nat64;
type VetKeyEpochId = nat64;
type ChatId = variant {
  Group : GroupChatId;
  Direct : record { principal; principal };
};
type EncryptedVetKey = blob;

derive_chat_vetkey : (ChatId, VetKeyEpochId, PublicTransportKey) -> (variant { Ok : EncryptedVetKey; Err : text });
```

Then, the canister checks that:

* The chat corresponding to the passed `ChatId` exists.

* The user has access to the chat at the passed `VetKeyEpochId`.

* The user did not upload an encrypted cache for his symmetric ratchet state for the vetKey epoch in question (see [State Recovery](#state-recovery)).

If the checks pass, the canister calls the [`vetkd_derive_key`](https://internetcomputer.org/docs/building-apps/network-features/vetkeys/api) API of the management canister with:

* `context` being computed by invoking the `ratchet_context` function defined below.

* `input` being the big-endian encoding of `VetKeyEpochId`.

* `transport_public_key` being the `PublicTransportKey` input argument.

* `key_id` being an implementation detail.

```rust
pub fn ratchet_context(chat_id_bytes: &[u8]) -> Vec<u8> {
  pub static DOMAIN_SEPARATOR_VETKEY_ROTATION: &str = "vetkeys-example-encrypted-chat-rotation";

  let mut context = vec![];
  context.extend_from_slice(&[DOMAIN_SEPARATOR_VETKEY_ROTATION.len() as u8]);
  context.extend_from_slice(DOMAIN_SEPARATOR_VETKEY_ROTATION.as_bytes());
  context.extend_from_slice(chat_id_bytes);
  context
}
```

> [!NOTE]
> `chat_id_bytes` is a serialization of the chat ID and is an implementation detail.

The actual initialization of the symmetric ratchet state is performed in the frontend and is, therefore, specified in [Ratchet Initialization](#ratchet-initialization) in the frontend.

### User's Encrypted Symmetric Ratchet State Cache

The canister backend provides the following APIs for storing users' encrypted symmetric ratchet states in the canister:
```
type PublicTransportKey = blob;
type EncryptedVetKey = blob;
type GroupChatId = nat64;
type ChatId = variant {
  Group : GroupChatId;
  Direct : record { principal; principal };
};
type VetKeyEpochId = nat64;
type EncryptedSymmetricRatchetCache = blob;
type DerivedVetKeyPublicKey = blob;

get_vetkey_for_my_cache_encryption : (PublicTransportKey) -> (EncryptedVetKey);
get_my_symmetric_key_cache : (ChatId, VetKeyEpochId) -> (variant { Ok : opt EncryptedSymmetricRatchetCache; Err : text });
update_my_symmetric_key_cache : (ChatId, VetKeyEpochId, EncryptedSymmetricRatchetCache) -> (variant { Ok; Err : text });
```

To facilitate those APIs, we make use of [Encrypted Maps](https://docs.rs/ic-vetkeys/latest/ic_vetkeys/encrypted_maps/struct.EncryptedMaps.html), which, as the name says, allow users to upload encrypted data into a map structure inside the canister.
The advantage in using Encrypted Maps is that 1) we do not need to design and implement such a scheme ourselves, and 2) Encrypted Maps allow to encrypt data efficiently in terms of both the number of fetched vetKeys and the efficiency of the used cryptography.

On a high level, the canister creates exactly one encrypted map for the user that stores _all_ their key caches.
The cache is stored in the map as a `(key, value)`, where `key` is a serialization of tuple `(ChatId, VetKeyEpochId)` and `value` is `EncryptedSymmetricRatchetCache`.

The user calls `get_vetkey_for_my_cache_encryption` to obtain the vetKey used for data encryption for their storage, which is called once upon initialization of the state in the frontend.
It can be called multiple times in general if the client loses their local state in the browser, e.g., when the client wants to use it on another device or in a different browser.

The user calls `update_my_symmetric_key_cache` and `get_my_symmetric_key_cache` to update or fetch their cache.
In `update_my_symmetric_key_cache`, the canister checks that:

* The user has access to the passed `ChatId` and `VetKeyEpochId`.

* The passed `EncryptedSymmetricRatchetCache` has a reasonable size. The purpose of this check is to prevent misuse e.g. for cycles draining attacks where an attacker would store huge amounts of data as `EncryptedSymmetricRatchetCache`. What a reasonable size is depends on how the symmetric ratchet state is serialized in the frontend, which is an implementation detail, but generally the limit can be quite generous, e.g., 100 bytes. In most cases the size will be fixed though, since `EncryptedSymmetricRatchetCache` contains an encryption of 1) a symmetric epoch key and 2) a `VetKeyEpochId`, which both have a fixed size. For example, if using AES-GCM with a 16-byte authentication tag and a 12-byte nonce, then `EncryptedSymmetricRatchetCache` will have the ciphertext overhead of 16 + 12 = 28 bytes in terms of size and the total ciphertext size will be 28 + 32 (symmetric epoch key) + 8 (`VetKeyEpochId`) = 68 bytes.

If the checks pass, the canister accepts the call and stores the cache, or overwrites if it exists, in the state.

The `get_my_symmetric_key_cache` call retrieves the response of Encrypted Maps for getting their cache corresponding to the input arguments, which is the encrypted bytes if the entry exists or `null` if it does not.

The expired caches are removed transparently to the user by the canister, i.e., the removal does not require explicit calls for doing that.
Expired cache is defined as a cache that neither has any messages associated with it in the canister nor does it correspond to the latest vetKey epoch for the chat ID.
See also [Disappearing Messages](#disappearing-messages).

TODO: give more details about the Encrypted Maps APIs and how they are called.

TODO: describe that as a potential optimization we could fetch all available cached ratchet states to reduce the number of calls.

TODO: how frequently?

### vetKey Epoch Rotation

The vetKey epoch rotation can happen because of two different reasons:

* Group change: this prevents a newly added user to be able to decrypt old messages or a deleted user to be able to decrypt new encrypted messages in the chat.

* User request: this prevents an attacker that obtained a symmetric ratchet state to be able do decrypt messages that will be encrypted after the vetKey epoch rotation takes place.

To facilitate this functionality, the canister provides two APIs:

```
type GroupChatId = nat64;
type ChatId = variant {
  Group : GroupChatId;
  Direct : record { principal; principal };
};
type VetKeyEpochId = nat64;
type GroupModification = record {
  remove_participants : vec principal;
  add_participants : vec principal;
};
type KeyRotationResult = variant { Ok : VetKeyEpochId; Err : text };

// Group change in a group chat such as user addition (without access to the past chat history) or user removal.
// Takes in a batch of such changes to potentially reduce the number of required rotations.
modify_group_chat_participants : (GroupChatId, GroupModification) -> (KeyRotationResult);

// User-initiated key rotation, e.g., periodic key rotation.
rotate_chat_vetkey : (ChatId) -> (KeyRotationResult);
```

Both have the same effect of rotation the vetKey epoch, but they follow different input validation rules. The rules for `modify_group_chat_participants` are discussed in [Group Changes](#group-changes).

To validate the inputs in a `rotate_chat_vetkey` call, the canister checks that the user has access to the passed chat ID and eventually if the user is authorized to perform a key rotation (see [Group Changes](#group-changes)).

Further validation rules can be added here and are an implementation detail. For example, the canister can rate-limit calls to `rotate_chat_vetkey` or make such calls dependent on further conditions such as user's subscription type.

### Disappearing Messages

Disappearing messages for a chat are defined by a non-negative integer identifying how many messages are expired, i.e., `e` expired messages mean that any message ID in the chat smaller than `e` has expired.
Expired messages cannot be [retrieved](#encrypted-message-retrieval) from the canister backend anymore and the canister backend will delete them eventually.

The deletion algorithm is an implementation detail of the canister backend, but in general we see two options:

* Delete expired messages in a timer job. This allows to delete messages periodically but running a timer job too often may be too expensive, so messages will be deleted with a delay.

* Delete expired messages while sending new messages, i.e., whenever the API for sending messages is invoked, it internally calls the message deletion routine. This works well if there is a lot of activity in the chat but will leave messages undeleted or deleted after a long delay if there is no or very little activity.

The chat allows to assign or update a disappearing messages duration for messages in a chat via the following backend canister API:

```
type GroupChatId = nat64;
type ChatId = variant {
  Group : GroupChatId;
  Direct : record { principal; principal };
};
type MessageExpiryMins = nat64;

set_message_expiry : (ChatId, MessageExpiryMins) ->  (variant { Ok; Err : text });
```

Upon receival of a `set_message_expiry` call, the backend canister checks that the user has access to `ChatId` and eventually that the user is authorized to call `set_message_expiry` for `ChatId` and sets `MessageExpiryMins` in the state for `ChatId`.

The semantics of `MessageExpiryMins` is as follows:

* If `MessageExpiryMins` is equal to zero, then this means no expiry is set and all messages are always returned.

* Otherwise the value of `MessageExpiryMins` is used as the message expiry.

Every chat is [created](#chat-creation) with the expiry of 0, which holds a special meaning that messages do not expire.
Once the state is updated, it affects the behavior of [the APIs returning the metadata about message IDs](#exposing-metadata-about-chats-and-new-messages) and [the APIs returning the actual messages](#encrypted-message-retrieval).

* `get_messages : (ChatId, ChatMessageId, opt Limit) -> (vec EncryptedMessage) query;` does not add expired messages to the output.

## User Frontend Component

### Frontend State

* Chat metadata for each chat.

  * Chat ID.

  * Number of received and decrypted messages so far.

  * Latest vetKey epoch ID.
  
  * VetKey epoch metadata for all vetKey epochs that were required for encryption or decryption. Note that the metadata of the vetKey epochs that are not the last vetKey epoch and whose messages have expired are removed from the state.

  * Message expiry data.

* Symmetric ratchet states for all vetKey epochs that were required for encryption or decryption. Similarly to vetKey epoch metadata, expired symmetric ratchet states are deleted from the state.

* Decrypted non-expired messages for each chat.

* Optional optimization: All messages and chats stored in browser storage.

### Chat UI

The chat UI is a UI that displays chats and their decrypted messages, and allows the user to send their own messages and change settings such as group membership and message expiration via UI elements.
It may also display the metadata about the encrypted chat such as the current epoch information if that fits the application.

The chat UI calls a few canister backend APIs directly, normally via dedicated UI buttons: [chat creation](#chat-creation), [vetKey rotation](#vetkey-epoch-rotation), [group changes](#group-changes), [updating the message expiry](#disappearing-messages).

Since the chat UI is mostly an implementation detail, only its interaction with [Encrypted Messaging Service (EMS)](#encrypted-messaging-service) is described here, whose purpose is it to take care of encryption and decryption of messages.

The chat UI uses the EMS in a black-box way to:

* Dispatch user messages to be encrypted and sent via the `enqueueSendMessage` API of the EMS.

* Fetch received and decrypted messages via periodically quering the `takeReceivedMessages` API of the EMS.

* Find out which chats are accessible at the moment via the `getCurrentChatIds` API of the EMS. New chats need to be added to the UI and chats that the user has lost access to need to be removed from the UI. 

### Encrypted Messaging Service

Encrypted Messaging Service (EMS) is a component that gives the developer a transparent way to interact with the encrypted chat by reading from a stream of received and decrypted messages and putting user messages to be encrypted and sent into a stream that the EMS will take care of encrypting and sending.

The EMS exposes the following APIs:

TODO: add types `ChatId`, `ChatIdAsString`, `Message`

* `enqueueSendMessage(chatId: ChatId, content: Uint8Array)`: adds the message `content` to be encrypted for and sent for adding to the chat with ID `chatId`. This API does not give any guarantees that the message will actually be added to the chat but it makes attempts to recover from recoverable errors (see [Encrypting and Sending Messages in the EMS](#encrypting-and-sending-messages)).

* `takeReceivedMessages(): Map<ChatIdAsString, Message[]>`: returns latest chat messages that were received and decrypted by the EMS and were not yet taken by the user from the EMS (see [Fetching and Decrypting Messages in the EMS](#fetching-and-decrypting-messages)).

* `start()`: starts the EMS service.

* `skipMessagesAvailableLocally(chatId: ChatId, lastKnownChatMessageId: bigint)`: tells the EMS what chat message ID should be the first one to fetch the messages. This is relevant if some of the messages are available from another source such as [browser storage](#local-cache-in-indexeddb).

* `getCurrentChatIds(): ChatId[]`: returns the chat IDs that are currently accessible to the user. This particular API is mostly an efficiency optimization, since the message retrieval in the EMS anyways requires fetching the information about the currently accessible chats.

#### Encrypting and Sending Messages

For message [encryption](#ratchet-message-encryption) and [sending](#incoming-message-validation), the EMS makes use of the following backend canister APIs: [`get_my_chats_and_time` and `get_vetkey_epoch_metadata`](#exposing-metadata-about-chats-and-new-messages).

The EMS periodically takes a message from the sending stream that was added via the `enqueueSendMessage` API. If the stream is empty, the EMS retries with a timeout. If the stream is non-empty, the EMS takes it from the stream and performs the following steps:

1. If there is no symmetric ratchet state for the chat, the EMS [initializes](#ratchet-initialization) the symmetric ratchet for the latest vetKey epoch id in the output of [`get_my_chats_and_time`](#exposing-metadata-about-chats-and-new-messages) and calls `get_vetkey_epoch_metadata` to obtain its metadata.

2. The EMS encrypts the message using the symmetric ratchet state that corresponds to the latest known vetKey epoch ID (see [Symmetric Ratchet](#symmetric-ratchet)) at the current time. It may happen that the symmetric ratchet epoch of the symmetric ratchet state is smaller than needed for the encryption at the current time. In that case, the state is copied to a temporary state and the temporary state is evolved to encrypt the message. After encryption, the temporary state may be deleted. Note that the encryption does not evolve the symmetric ratchet state because the canister ultimately decides when a symmetric epoch ends. The indication that a symmetric ratchet epoch has ended and the previous epoch is not needed anymore is that the frontend fetches a message that was encrypted with the next symmetric ratchet epoch. The evolution of the state then happens in the process of [decryption](#fetching-and-decrypting-messages) of that message.

3. The EMS [sends](#incoming-message-validation) the message.

4. If the canister returns the `WrongSymmetricKeyEpoch` variant of `MessageSendingError`, then the EMS was unlucky and the sent message arrived at the next symmetric key epoch. In this case the EMS goes to step 2.

5. If the canister returns the `WrongVetKeyEpoch` variant of `MessageSendingError`, then either the [manual vetKey epoch rotation](#vetkey-epoch-rotation) or a [group change](#group-changes) took place. In this case, the EMS 

To avoid infinite loops in case of too strict parameters, bad network connectivity, etc., the maximum number of retries should be capped.

TODO: maybe we should expose `getLatestVetKeyEpochMetadata()` in the EMS to have a central place where this API is queried because in the chat UI we use it to find out the current chat participants. Alternatively, just expose a function that returns the participants.

#### Fetching and Decrypting Messages

For message [retrieval](#encrypted-message-retrieval) and [decryption](#ratchet-message-decryption), the EMS makes use of the following backend canister APIs: [`get_my_chats_and_time` and `get_vetkey_epoch_metadata`](#exposing-metadata-about-chats-and-new-messages).

Also, the `get_messages` backend canister API is used to retrieve the encrypted messages for the chat. Its behavior is closer described in [Encrypted Message Retrieval](#encrypted-message-retrieval).

The frontend stores the following in its state: the chat IDs, the first accessible message ID for the user, the last fetched message, and the total number of messages in the chat.
Let us call this information frontend chat metadata.

Periodically, the EMS queries the `get_my_chats_and_time` backend canister API.
Its result is compared to the frontend chat metadata in the state.
If there is a new chat in the result that is not yet in the state, the EMS adds it to the state along with the information that no messages were obtained for this chat yet.
If one of the chat in the state does not appear in the result of `get_my_chats_and_time` anymore, than this chat is deleted from the state.

Also periodically, two separate routines run.

1. Check if there are new messages to be fetched from the canister: if the largest received message ID for the chat plus one is smaller than the total number of messages in the chat. If it is, then `get_messages` is invoked with the first message ID to be fetched that is equal to the largest received message ID for the chat plus one. If an error occurs due to too large messages that don't fit into the response, the query to `get_messages` is retried with a limit of one. A successful result is stored in the received messages queue.

2. Try to take a message from the received messages queue and decrypt it.

    a. The EMS checks if it already has the symmetric ratchet state in its state that is required to decrypt the message, whose metadata specifies the required vetKey epoch and symmetric ratchet epoch. If the symmetric ratchet state is not yet initialized, the EMS [initializes](#ratchet-initialization) it. An error to do so is unrecoverable.
    
    b. The EMS [decrypts](#ratchet-message-decryption) the message using the symmetric ratchet state and the vetKey epoch ID stored in the message metadata. A successfully decrypted message is put into the decrypted message queue that is exposed to the chat UI component via the [`takeReceivedMessages` API](#encrypted-messaging-service) of the EMS. If the decryption returns an error, such an error is unrecoverable and instead of a decrypted message, a message of special form is put into the decrypted message queue that indicated that this message could not be decrypted. Note that user-side errors cannot be avoided, since the canister cannot check if the encryption is valid.

TODO: in the above point it may happen that the calculation is incorrect because if some messages expire, the first accessible message ID moves. We should probably just use the last received message ID instead.

TODO: change this to not evolve on decryption. We want to evolve this whenever messages disappear. The ratchet specifies how granular we can make messages disappear and provides forward security for symmetric epochs we already "forgot".

#### vetKey Epoch Rotation

#### Symmetric Ratchet

A symmetric ratchet state consists of a symmetric ratchet epoch key and a symmetric ratchet epoch id that it corresponds to.

##### Ratchet Initialization

The ratchet state is initialized from a vetKey as follows:

1. Fetch, decrypt, and verify the vetKey

    a. [Generate](https://dfinity.github.io/vetkeys/classes/_dfinity_vetkeys.TransportSecretKey.html#random) a transport key pair.

    b. [Fetch](#providing-vetkeys-for-symmetric-ratchet-initialization) the encrypted vetKey for the chat and vetKey epoch from the backend canister.

    c. Compute the verification public key either [locally](https://dfinity.github.io/vetkeys/classes/_dfinity_vetkeys.MasterPublicKey.html) or via querying the `chat_public_key` backend canister API.

    d. [Decrypt and verify](https://dfinity.github.io/vetkeys/classes/_dfinity_vetkeys.EncryptedVetKey.html#decryptandverify) the vetKey.

2. Compute and save the ratchet state

    a. Compute [`let rootKey = deriveSymmetricKey(vetKeyBytes, DOMAIN_RATCHET_INIT, 32)`](https://github.com/dfinity/vetkeys/blob/83b887f220a2c1c40713a3512ce5a9994d5ec4c6/frontend/ic_vetkeys/src/utils/utils.ts#L352), where `DOMAIN_RATCHET_INIT` is a unique domain separator for ratchet initialization (TODO: this function is currently internal - we should make it public).

    b. Initialize the symmetric ratchet state as `rootKey` and symmetric ratchet epoch that is equal to zero.

More details about the retrieval and decryption of vetKeys can be found in the [developer docs](https://internetcomputer.org/docs/building-apps/network-features/vetkeys/api) of the ICP.

TODO: add initialization from cache

##### Ratchet Evolution

```ts
import { deriveSymmetricKey } from '@dfinity/vetkeys';

type RawSymmetricRatchetState = { epochKey: Uint8Array, epochId: bigint };

function evolve(symmetricRatchetState: RawSymmetricRatchetState) : RawSymmetricRatchetState {
	const domainSeparator = new Uint8Array([
		...DOMAIN_RATCHET_STEP,
		...uBigIntTo8ByteUint8ArrayBigEndian(symmetricRatchetState.epochId)
	]);
	const newEpochkey = deriveSymmetricKey(symmetricRatchetState.epochKey, domainSeparator, 32);

  return { epochKey: newEpochkey, epochId: symmetricRatchetState.epochId + 1n}
}
```
where `DOMAIN_RATCHET_STEP` is a unique domain separator.

Alternatively, this can be implemented using Web Crypto API to make the current key non-extractable. Note though that Web Crypto API's `deriveKey` cannot derive an HKDF key and, therefore, to derive the next epoch key, it first needs to be derive via `deriveBits`, which returns the next epoch key in form of a byte vector, which needs to be imported as `CryptoKey`.

```ts
type SymmetricRatchetState = { epochKey: CryptoKey, epochId: bigint };

async function deriveNextSymmetricRatchetEpochCryptoKey(symmetricRatchetState: RawSymmetricRatchetState) : Promise<CryptoKey> {
	const exportable = false;
	const domainSeparator = ratchetStepDomainSeparator()
	const algorithm = {
		name: 'HKDF',
		hash: 'SHA-256',
		length: 32 * 8,
		info: domainSeparator,
		salt: new Uint8Array()
	};

	const rawKey = await globalThis.crypto.subtle.deriveBits(algorithm, epochKey, 8 * 32);

	return await globalThis.crypto.subtle.importKey('raw', rawKey, algorithm, exportable, [
		'deriveKey',
		'deriveBits'
	]);
}
```

It would be quite natural and similar to [Signal's symmetric ratchet](https://signal.org/docs/specifications/doubleratchet/) if the decryption would trigger the ratchet evolution. However, that would force the frontned to decrypt all messages belonging to one vetKey epoch in cases where a chat has many messages and we only want to display the latest ones. This incurs a big and unnecessary overhead in terms of both communication and computation.

Therefore, neither encryption nor decryption directly evolve `SymmetricRatchetState` but instead, the state is evolved whenever the current consensus time obtained via `get_my_chats_and_time` minus the message expiry is larger than the timestamp of the current symmetric key epoch id + 1, i.e., whenever there can be no non-expired message that we would need the current symmetric ratchet epoch to decrypt. The state evolution can be triggered by a background job that periodically checks if state evolution should be performed. 

##### Ratchet Message Encryption
```ts
import { DerivedKeyMaterial } from '@dfinity/vetkeys';

async encrypt(
    epochKey: CryptoKey,
	sender: Principal,
	nonce: Uint8Array,
	message: Uint8Array
): Promise<Uint8Array> {
	const domainSeparator = messageEncryptionDomainSeparator(sender, nonce);
	const derivedKeyMaterial = DerivedKeyMaterial.fromCryptoKey(epochKey);
	return await derivedKeyMaterial.encryptMessage(message, domainSeparator);
}
```
where [`messageEncryptionDomainSeparator`](#typescript-domain-separators) is a unique [size-prefixed](#typescript-size-prefix) domain separator.

##### Ratchet Message Decryption

```ts

import { DerivedKeyMaterial } from '@dfinity/vetkeys';

async decrypt(
    epochKey: CryptoKey,
	sender: Principal,
	nonce: Uint8Array,
	message: Uint8Array
): Promise<Uint8Array> {
	const domainSeparator = messageEncryptionDomainSeparator(sender, nonce);
	const derivedKeyMaterial = DerivedKeyMaterial.fromCryptoKey(epochKey);
	return await derivedKeyMaterial.encryptMessage(message, domainSeparator);
}
```
where [`messageEncryptionDomainSeparator`](#typescript-domain-separators) is a unique [size-prefixed](#typescript-size-prefix) domain separator.

#### State Cache

##### Encrypted Maps

## Ensuring Correctness of Query Calls

TODO

Idea 1: use query calls and start work, while in the background an update call is invoked to compare the result.

Idea 2: use certified variables.

Comment by Andrea regarding Idea 2:
In a multi-user canister scenario then it may be difficult to add certificates for this endpoint. However, for individual user/chat canisters, then it should be easy to provide certificates, e.g. of chat ID, time and latest message ID.

Is something like mixed hash tree possible in a single canister scenario to reduce hashing times if hashing a huge state? Probably not extremely important, but may be useful to discuss.

## Optimizations

### Local Cache in indexedDB

### IBE-Encrypted vetKey Resharing

### Group Changes Allowing to See Messsage History

## Appendix

### Constructing `ChatId`

```
type GroupChatId = nat64;

type ChatId = variant {
  Group : GroupChatId;
  Direct : record { principal; principal };
};
```

**Direct**: The `ChatId` type is constructed from a pair of _sorted_ principals. It is valid if the principals are equal and corresponds to a user's private chat (similar to e.g. Signal's "Note to Self" chat).

**Group**: The `ChatId` type is constructed from a _unique_ group chat ID, which is defined by an unsigned 64-bit number. The backend is responsible of issuing those and ensuring their uniqueness.

### Calculating Current Symmetric Ratchet Epoch ID

```rust
fn current_symmetric_ratchet_epoch(
  vetkey_epoch_creation_time_nanos: u64,
  symmetric_ratchet_rotation_duration_nanos: u64
) {
  let now = ic_cdk::api::time();
  let elapsed = vetkey_epoch_creation_time_nanos - now;
  return elapsed / symmetric_ratchet_rotation_duration_nanos;
}
```

### TypeScript Conversion of Unsigned BigInt to Uint8Array

```ts
function uBigIntTo8ByteUint8ArrayBigEndian(value: bigint): Uint8Array {
	if (value < 0n) throw new RangeError('Accepts only bigint n >= 0');
    if ((value >> 128) > 0n) throw new RangeError('Accepts only bigint fitting into an 8-byte array');

	const bytes = new Uint8Array(8);
	for (let i = 0; i < 8; i++) {
		bytes[i] = Number((value >> BigInt(i * 8)) & 0xffn);
	}
	return bytes;
}
```

### TypeScript CryptoKey Import
```ts
let keyBytes = /*  */;
let exportable = false;
await globalThis.crypto.subtle.importKey(
		'raw',
		keyBytes,
		'HKDF',
		exportable,
		['deriveKey', 'deriveBits']
	);
```

### TypeScript Size Prefix

```ts
export function sizePrefixedBytesFromString(text: string): Uint8Array {
	const bytes = new TextEncoder().encode(text);
	if (bytes.length > 255) {
		throw new Error('Text is too long');
	}
	const size = new Uint8Array(1);
	size[0] = bytes.length & 0xff;
	return new Uint8Array([...size, ...bytes]);
}
```

### TypeScript Domain Separators

```ts

// Example definition of the domain separators
const DOMAIN_RATCHET_INIT = sizePrefixedBytesFromString('ic-vetkeys-chat-ratchet-init');
const DOMAIN_RATCHET_STEP = sizePrefixedBytesFromString('ic-vetkeys-chat-ratchet-step');
const DOMAIN_MESSAGE_ENCRYPTION = sizePrefixedBytesFromString(
	'ic-vetkeys-chat-message-encryption'
);

export function messageEncryptionDomainSeparator(
	sender: Principal,
	nonce: Uint8Array
): Uint8Array {
  if (nonce.length !== 16) { throw RangeError("Expected nonce of size 16 but got " + nonce.length); }
	return new Uint8Array([
		...DOMAIN_MESSAGE_ENCRYPTION,
		...sender.toUint8Array(),
		...uBigIntTo8ByteUint8ArrayBigEndian(nonce)
	]);
}

export function ratchetStepDomainSeparator(currentSymmetricKeyEpoch: bigint){
  new Uint8Array([
	  	...DOMAIN_RATCHET_STEP,
  		...uBigIntTo8ByteUint8ArrayBigEndian(currentSymmetricKeyEpoch)
  	]);
}
```

### Candid Interface of the Backend

```candid
type GroupChatId = nat64;
type ChatId = variant {
  Group : GroupChatId;
  Direct : record { principal; principal };
};
type VetKeyEpochId = nat64;
type SymmetricKeyEpochId = nat64;
type ChatMessageId = nat64;
type Nonce = blob;
type Limit = nat32;
type TimeNanos = nat64;
type NumberOfMessages = nat64;
type SymmetricKeyRotationMins = nat64;
type MessageExpiryMins = nat64;

type KeyRotationResult = variant { Ok : VetKeyEpochId; Err : text };
type EncryptedMessage = record {
  content : EncryptedBytes;
  metadata : EncryptedMessageMetadata;
};

// vetKeys
type PublicTransportKey = blob;
type DerivedVetKeyPublicKey = blob;
type EncryptedVetKey = blob;
type IbeEncryptedVetKey = blob;

type EncryptedMessageMetadata = record {
  vetkey_epoch : VetKeyEpochId;
  sender : principal;
  symmetric_key_epoch_id : SymmetricKeyEpochId;
  chat_message_id : ChatMessageId;
  timestamp : TimeNanos;
  nonce : Nonce;
};
type GroupChatMetadata = record { creation_timestamp : TimeNanos; chat_id : GroupChatId };
type GroupModification = record {
  remove_participants : vec principal;
  add_participants : vec principal;
};
type EncryptedBytes = blob;
type UserMessage = record {
  vetkey_epoch_id : VetKeyEpochId;
  content : EncryptedBytes;
  symmetric_key_epoch_id : SymmetricKeyEpochId;
  nonce : Nonce;
};
type NumberOfMessages = nat64;
type Receiver = principal;
type OtherParticipant = principal;
type VetKeyEpochMetadata = record {
  symmetric_key_rotation_duration : SymmetricKeyRotationMins;
  participants : vec principal;
  messages_start_with_id : ChatMessageId;
  creation_timestamp : TimeNanos;
  epoch_id : VetKeyEpochId;
};
type KeyRotationResult = variant { Ok : VetKeyEpochId; Err : text };
type MessageSendingError = variant { WrongVetKeyEpoch; WrongSymmetricKeyEpoch; Custom: text };
type ChatMetadata = record {
  chat_id : ChatId;
  number_of_messages : NumberOfMessages;
  vetkey_epoch_id : VetKeyEpochId;
  symmetric_epoch_id : SymmetricEpochId;
};

service : (text) -> {
  chat_public_key : (ChatId, VetKeyEpochId) -> (DerivedVetKeyPublicKey);
  create_direct_chat : (OtherParticipant, SymmetricKeyRotationMins) -> variant { Ok : TimeNanos; Err : text };
  create_group_chat : (vec OtherParticipant, SymmetricKeyRotationMins) -> (variant { Ok : GroupChatMetadata; Err : text });
  derive_chat_vetkey : (ChatId, VetKeyEpochId, PublicTransportKey) -> (variant { Ok : EncryptedVetKey; Err : text });
  get_vetkey_for_my_cache_encryption : (PublicTransportKey) -> (EncryptedVetKey);
  get_latest_chat_vetkey_epoch_metadata : (ChatId) -> (variant { Ok : VetKeyEpochMetadata; Err : text }) query;
  get_my_chats_and_time : () -> (vec ChatMetadata) query;
  get_my_reshared_ibe_encrypted_vetkey : (ChatId, VetKeyEpochId) -> (variant { Ok : opt IbeEncryptedVetKey; Err : text });
  get_my_symmetric_key_cache : (ChatId, VetKeyEpochId) -> (variant { Ok : opt EncryptedSymmetricRatchetCache; Err : text });
  // Returns messages for a chat starting from a given message id.
  get_messages : (ChatId, ChatMessageId, opt Limit) -> (
      vec EncryptedMessage,
    ) query;
  get_vetkey_epoch_metadata : (ChatId, VetKeyEpochId) -> (variant { Ok : VetKeyEpochMetadata; Err : text }) query;
  get_vetkey_resharing_ibe_decryption_key : (PublicTransportKey) -> (EncryptedVetKey);
  get_vetkey_resharing_ibe_encryption_key : (Receiver) -> (DerivedVetKeyPublicKey);
  modify_group_chat_participants : (ChatGroupId, GroupModification) -> (KeyRotationResult);
  reshare_ibe_encrypted_vetkeys : (
      ChatId,
      VetKeyEpochId,
      vec record { Receiver; IbeEncryptedVetKey },
    ) -> (variant { Ok; Err : text });
  rotate_chat_vetkey : (ChatId) -> (KeyRotationResult);
  send_message : (ChatId, UserMessage) -> (variant { Ok; Err : MessageSendingError });
  set_message_expiry : (ChatId, MessageExpiryMins) ->  (variant { Ok; Err : text });
  update_my_symmetric_key_cache : (ChatId, VetKeyEpochId, EncryptedSymmetricRatchetCache) -> (variant { Ok; Err : text });
}
```