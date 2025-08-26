# Diagrams Created With Cursor

I'll analyze the backend and frontend code to understand the high-level flow and create meaningful mermaid diagrams. Let me start by exploring the codebase structure and understanding the key components.


Now let me examine the backend interface definition to understand the complete API:


Based on my analysis of the codebase, I'll create comprehensive mermaid diagrams showing the high-level flow of the encrypted chat system. The system uses vetKeys for cryptographic operations and has a sophisticated key management system with ratcheting and resharing capabilities.

## Backend Architecture & Flow

### 1. Chat Creation & Key Management Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant VetKD
    participant EncryptedMaps

    Note over User,EncryptedMaps: Chat Creation Flow
    
    User->>Frontend: Create Direct/Group Chat
    Frontend->>Backend: create_direct_chat() / create_group_chat()
    Backend->>Backend: Initialize VetKey epoch metadata
    Backend->>Backend: Set up message counters & expiry settings
    Backend->>Backend: Store participant mappings
    Backend-->>Frontend: Chat created with epoch 0
    
    Note over User,EncryptedMaps: Key Derivation Flow
    
    Frontend->>Backend: derive_chat_vetkey(chat_id, epoch, transport_key)
    Backend->>Backend: Validate user access & epoch
    Backend->>VetKD: vetkd_derive_key(context, transport_key)
    VetKD-->>Backend: Encrypted vetKey
    Backend-->>Frontend: Encrypted vetKey for decryption
    
    Note over User,EncryptedMaps: Key Rotation Flow
    
    Frontend->>Backend: rotate_chat_vetkey(chat_id)
    Backend->>Backend: Create new epoch (epoch_id + 1)
    Backend->>Backend: Update participant mappings
    Backend->>Backend: Clean up expired epochs
    Backend-->>Frontend: New epoch ID
```

### 2. Message Encryption & Decryption Flow

```mermaid
sequenceDiagram
    participant Sender
    participant Frontend
    participant Backend
    participant SymmetricRatchet
    participant VetKey

    Note over Sender,VetKey: Message Sending Flow
    
    Sender->>Frontend: Type message
    Frontend->>SymmetricRatchet: Get current symmetric key epoch
    SymmetricRatchet->>SymmetricRatchet: Calculate epoch from time
    SymmetricRatchet->>VetKey: Derive symmetric key from vetKey
    SymmetricRatchet->>SymmetricRatchet: Encrypt message with domain separator
    Frontend->>Backend: send_direct_message() / send_group_message()
    Backend->>Backend: Validate vetKey & symmetric key epochs
    Backend->>Backend: Store encrypted message with metadata
    Backend->>Backend: Set message expiry timer
    Backend-->>Frontend: Message stored with chat_message_id
    
    Note over Sender,VetKey: Message Retrieval Flow
    
    Frontend->>Backend: get_some_messages_for_chat_starting_from()
    Backend->>Backend: Filter messages by user access
    Backend-->>Frontend: Encrypted messages with metadata
    Frontend->>SymmetricRatchet: Decrypt message at specific epoch
    SymmetricRatchet->>VetKey: Derive symmetric key for epoch
    SymmetricRatchet->>SymmetricRatchet: Decrypt with domain separator
    Frontend-->>Sender: Decrypted message displayed
```

### 3. Key Caching & Resharing Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant EncryptedMaps
    participant VetKD

    Note over User,VetKD: Local Key Caching Flow
    
    Frontend->>Backend: get_my_symmetric_key_cache(chat_id, epoch)
    Backend->>EncryptedMaps: Retrieve encrypted cache for user
    EncryptedMaps-->>Backend: Encrypted symmetric key cache
    Backend-->>Frontend: Encrypted cache data
    
    Frontend->>Backend: update_my_symmetric_key_cache(chat_id, epoch, cache)
    Backend->>EncryptedMaps: Store encrypted cache with expiry
    Backend->>Backend: Set cache expiry timer
    Backend-->>Frontend: Cache updated successfully
    
    Note over User,VetKD: Key Resharing Flow
    
    Frontend->>Backend: get_vetkey_resharing_ibe_encryption_key(user)
    Backend->>VetKD: vetkd_public_key(resharing_context)
    VetKD-->>Backend: IBE encryption key for user
    Backend-->>Frontend: IBE encryption key
    
    Frontend->>Backend: reshare_ibe_encrypted_vetkeys(users, encrypted_vetkeys)
    Backend->>Backend: Store reshared vetKeys for participants
    Backend-->>Frontend: Resharing completed
    
    Frontend->>Backend: get_my_reshared_ibe_encrypted_vetkey(chat_id, epoch)
    Backend->>Backend: Retrieve reshared vetKey for user
    Backend-->>Frontend: Reshared vetKey if available
```

## Frontend Architecture & Flow

### 4. Frontend Service Architecture

```mermaid
graph TB
    subgraph "Frontend Services"
        ChatUI[Chat UI Components]
        ChatStore[Chat Store]
        RatchetService[Ratchet Initialization Service]
        CanisterAPI[Canister API Service]
        KeyStorage[Key Storage Service]
        EncryptedCache[Encrypted Canister Cache Service]
        VetKeyResharing[VetKey Resharing Service]
        ChatStorage[Chat Storage Service]
    end
    
    subgraph "Cryptographic Layer"
        SymmetricRatchet[Symmetric Ratchet State]
        VetKeyDerivation[VetKey Derivation]
        MessageEncryption[Message Encryption/Decryption]
    end
    
    subgraph "Storage Layer"
        IndexedDB[(IndexedDB)]
        LocalStorage[(Local Storage)]
        CanisterCache[(Canister Encrypted Cache)]
    end
    
    ChatUI --> ChatStore
    ChatStore --> RatchetService
    RatchetService --> CanisterAPI
    RatchetService --> KeyStorage
    RatchetService --> EncryptedCache
    RatchetService --> VetKeyResharing
    
    CanisterAPI --> SymmetricRatchet
    SymmetricRatchet --> MessageEncryption
    MessageEncryption --> VetKeyDerivation
    
    KeyStorage --> IndexedDB
    ChatStorage --> IndexedDB
    EncryptedCache --> CanisterCache
    VetKeyResharing --> CanisterCache
```

### 5. Frontend Key Initialization Flow

```mermaid
flowchart TD
    A[User Opens Chat] --> B[Initialize Ratchet State]
    B --> C{Check Local Storage}
    C -->|Found| D[Load Key State]
    C -->|Not Found| E{Check Remote Cache}
    E -->|Found| F[Decrypt & Load Cache]
    E -->|Not Found| G{Check Reshared Keys}
    G -->|Found| H[Decrypt Reshared VetKey]
    G -->|Not Found| I[Derive New VetKey]
    
    I --> J[Call derive_chat_vetkey]
    J --> K[Decrypt VetKey with Transport Key]
    K --> L[Derive Symmetric Key]
    L --> M[Cache Locally & Remotely]
    
    D --> N[Create SymmetricRatchetState]
    F --> N
    H --> N
    M --> N
    
    N --> O[Ready for Encryption/Decryption]
    
    style A fill:#e1f5fe
    style O fill:#c8e6c9
    style I fill:#fff3e0
    style M fill:#fff3e0
```

### 6. Message Lifecycle Flow

```mermaid
sequenceDiagram
    participant UI
    participant ChatStore
    participant RatchetService
    participant CanisterAPI
    participant Backend
    participant Storage

    Note over UI,Storage: Message Sending
    
    UI->>ChatStore: Send message
    ChatStore->>RatchetService: Get current ratchet state
    RatchetService->>RatchetService: Calculate current epoch
    RatchetService->>RatchetService: Encrypt message
    ChatStore->>CanisterAPI: send_direct_message() / send_group_message()
    CanisterAPI->>Backend: API call
    Backend-->>CanisterAPI: Success response
    CanisterAPI-->>ChatStore: Message sent
    ChatStore->>Storage: Save to local storage
    ChatStore-->>UI: Message displayed
    
    Note over UI,Storage: Message Receiving
    
    UI->>ChatStore: Load messages
    ChatStore->>CanisterAPI: get_some_messages_for_chat_starting_from()
    CanisterAPI->>Backend: API call
    Backend-->>CanisterAPI: Encrypted messages
    CanisterAPI-->>ChatStore: Messages received
    ChatStore->>RatchetService: Decrypt each message
    RatchetService->>RatchetService: Derive key for message epoch
    RatchetService->>RatchetService: Decrypt with domain separator
    ChatStore->>Storage: Save decrypted messages
    ChatStore-->>UI: Messages displayed
```

## Key Cryptographic Concepts

### 7. VetKey & Symmetric Key Hierarchy

```mermaid
graph TD
    subgraph "VetKey System"
        VetKD[VetKD Canister]
        ChatContext[Chat Context<br/>chat_id + vetkey_epoch]
        VetKey[VetKey<br/>Derived from context]
    end
    
    subgraph "Symmetric Key System"
        SymmetricEpoch[Symmetric Key Epoch<br/>Time-based rotation]
        SymmetricKey[Symmetric Key<br/>Derived from VetKey + epoch]
        MessageKey[Message Key<br/>Derived from Symmetric Key + domain]
    end
    
    subgraph "Domain Separators"
        RatchetInit[Ratchet Init Domain]
        RatchetStep[Ratchet Step Domain]
        MessageEnc[Message Encryption Domain<br/>sender + message_id]
    end
    
    VetKD --> ChatContext
    ChatContext --> VetKey
    VetKey --> SymmetricEpoch
    SymmetricEpoch --> SymmetricKey
    SymmetricKey --> MessageKey
    
    MessageKey --> RatchetInit
    MessageKey --> RatchetStep
    MessageKey --> MessageEnc
    
    style VetKD fill:#ffcdd2
    style VetKey fill:#c8e6c9
    style SymmetricKey fill:#fff3e0
    style MessageKey fill:#e1f5fe
```

These diagrams show the comprehensive flow of the encrypted chat system, highlighting:

1. **Backend Flow**: Chat creation, key management, message handling, and cryptographic operations
2. **Frontend Flow**: Service architecture, key initialization, and message lifecycle
3. **Cryptographic Flow**: How vetKeys, symmetric keys, and message keys are derived and used
4. **Key Management**: Caching, resharing, and rotation mechanisms
5. **Security Features**: Epoch-based key rotation, message expiry, and access control

The system uses a sophisticated multi-layered approach where vetKeys provide the foundation for deriving symmetric keys, which are then used for message encryption/decryption with time-based rotation and resharing capabilities.

## Class Diagrams for Encrypted Messaging Service

### 1. Core Service Architecture & Relationships

```mermaid
classDiagram
    class EncryptedMessagingService {
        -RatchetInitializationService ratchetInitializationService
        -KeyManager keyManager
        -Map sendingQueue
        -Map receivingQueue
        -Map receivingQueueToDecrypt
        -Map firstAccessibleMessageId
        -Map chatIdToCurrentNumberOfRemoteMessages
        -Map chatIdToCurrentNumberOfFetchedMessages
        -BackgroundWorker backgroundWorker
        +start()
        +enqueueSendMessage(chatId, content)
        +takeReceivedMessages()
        +skipMessagesAvailableLocally(chatId, numMessages)
        +getCurrentChatIds()
        +signalStopWorker()
    }

    class KeyManager {
        -Map symmetricRatchetStates
        +getCurrentChatIdStrs()
        +inductSymmetricRatchetState(chatId, vetKeyEpoch, state)
        +encryptNow(chatId, sender, senderMessageId, message)
        +decryptAtTimeAndEvolveIfNeeded(chatId, sender, senderMessageId, vetKeyEpoch, encryptedBytes, time)
        +doesChatHaveKeys(chatId)
        +doesChatHaveRatchetStateForEpoch(chatId, vetKeyEpoch)
        -lastVetKeyEpoch(chatId)
    }

    class RatchetInitializationService {
        -VetKeyResharingService vetKeyResharingService
        -EncryptedCanisterCacheService encryptedCanisterCacheService
        +initializeRatchetStateAndReshareAndCacheIfNeeded(chatId, vetKeyEpoch)
        +cryptoKeyStateFromLocalStorage(chatId, vetKeyEpoch)
        +cryptoKeyStateFromRemoteCache(chatId, vetKeyEpoch)
        +cryptoKeyStateFromResharedVetKey(chatId, vetKeyEpoch)
        +fetchAndReshareAndCacheVetKey(chatId, vetKeyEpoch)
    }

    class SymmetricRatchetState {
        -CryptoKey cryptoKey
        -bigint symmetricRatchetEpoch
        -Date creationTime
        -Date rotationDuration
        +encryptNow(sender, senderMessageId, message)
        +decryptAtTimeAndEvolveIfNeeded(sender, senderMessageId, message, time)
        +evolve()
        +evolveTo(symmetricKeyEpoch)
        +peekAtEpoch(symmetricKeyEpoch)
        +getExpectedEpochAtTime(time)
    }

    class CacheableSymmetricRatchetState {
        -Uint8Array rawKey
        -bigint symmetricRatchetEpoch
        -Date creationTime
        -Date rotationDuration
        +evolve()
        +evolveTo(symmetricKeyEpoch)
        +peekAtEpoch(symmetricKeyEpoch)
        +toSymmetricRatchetState()
        +static initializeFromVetKey(vetKey, creationTime, rotationDuration)
        +serialize()
        +static deserialize(bytes)
    }

    class BackgroundWorker {
        -AbortController abortController
        +start(pollingCallback, sendingCallback)
        +abort()
    }

    EncryptedMessagingService --> KeyManager : uses
    EncryptedMessagingService --> RatchetInitializationService : uses
    EncryptedMessagingService --> BackgroundWorker : uses
    KeyManager --> SymmetricRatchetState : manages
    RatchetInitializationService --> SymmetricRatchetState : creates
    RatchetInitializationService --> CacheableSymmetricRatchetState : creates
    SymmetricRatchetState --> CacheableSymmetricRatchetState : converts to/from
```

### 2. Key Management & Storage Services

```mermaid
classDiagram
    class KeyManager {
        -Map~string, Map~bigint, SymmetricRatchetState~~ symmetricRatchetStates
        +getCurrentChatIdStrs()
        +inductSymmetricRatchetState(chatId, vetKeyEpoch, state)
        +encryptNow(chatId, sender, senderMessageId, message)
        +decryptAtTimeAndEvolveIfNeeded(chatId, sender, senderMessageId, vetKeyEpoch, encryptedBytes, time)
        +doesChatHaveKeys(chatId)
        +doesChatHaveRatchetStateForEpoch(chatId, vetKeyEpoch)
        -lastVetKeyEpoch(chatId)
    }

    class KeyStorageService {
        +getSymmetricKeyState(chatIdStr, vetKeyEpochStr)
        +saveSymmetricKeyState(chatIdStr, vetKeyEpochStr, keyState)
        +saveIbeDecryptionKey(keyBytes)
        +getIbeDecryptionKey()
    }

    class EncryptedCanisterCacheService {
        -EncryptedMaps encryptedMaps
        +fetchAndDecryptFor(chatId, vetKeyEpoch)
        +encryptAndStoreFor(chatId, vetKeyEpoch, cache)
    }

    class VetKeyResharingService {
        +reshareIbeEncryptedVetKeys(chatId, vetkeyEpoch, otherParticipants, vetKeyBytes)
        +fetchResharedIbeEncryptedVetKey(chatId, vetkeyEpoch)
    }

    class ChatStorageService {
        +saveMessage(message)
        +getMessages(chatId)
        +deleteMessage(chatId, messageId)
        +saveChat(chat)
        +deleteChat(chatId)
        +getAllChats()
        +saveUserConfig(config)
        +getUserConfig()
        +getMyUserConfig()
    }

    class CanisterAPI {
        +createDirectChat(actor, receiver, symmetricKeyRotationDurationMinutes, messageExpirationDurationMinutes)
        +createGroupChat(actor, otherParticipants, symmetricKeyRotationDurationMinutes, messageExpirationDurationMinutes)
        +sendDirectMessage(actor, receiver, message)
        +sendGroupMessage(actor, groupChatId, message)
        +getChatIdsAndCurrentNumbersOfMessages(actor)
        +getLatestVetKeyEpochMetadata(actor, chatId)
        +getVetKeyEpochMetadata(actor, chatId, vetKeyEpoch)
        +deriveChatVetKey(actor, chatId, optVetkeyEpoch, transportKey)
        +getChatPublicKey(actor, chatId, vetkeyEpoch)
        +rotateChatVetKey(actor, chatId)
        +getMySymmetricKeyCache(actor, chatId, vetKeyEpoch)
        +updateMySymmetricKeyCache(actor, chatId, vetKeyEpoch, userCache)
        +getMyResharedIbeEncryptedVetKey(actor, chatId, vetKeyEpoch)
        +reshareIbeEncryptedVetKeys(actor, chatId, vetKeyEpoch, usersAndEncryptedVetKeys)
        +getVetKeyResharingIbeEncryptionKey(actor, user)
        +getVetKeyResharingIbeDecryptionKey(actor, transportKey)
        +getEncryptedVetKeyForMyCacheStorage(actor, transportKey)
        +getVetKeyVerificationKeyForMyCacheStorage(actor)
        +modifyGroupChatParticipants(actor, groupChatId, groupModification)
        +getSomeMessagesForChatStartingFrom(actor, chatId, messageId, limit)
        +firstAccessibleMessageId(actor, groupChatId)
    }

    KeyManager --> KeyStorageService : stores/retrieves keys
    KeyManager --> EncryptedCanisterCacheService : uses for remote caching
    RatchetInitializationService --> KeyStorageService : uses
    RatchetInitializationService --> EncryptedCanisterCacheService : uses
    RatchetInitializationService --> VetKeyResharingService : uses
    RatchetInitializationService --> CanisterAPI : uses
    VetKeyResharingService --> KeyStorageService : stores IBE keys
    VetKeyResharingService --> CanisterAPI : uses
    EncryptedCanisterCacheService --> CanisterAPI : uses
```

### 3. State Management & UI Integration

```mermaid
classDiagram
    class ChatStore {
        +chats: Chat[]
        +selectedChatId: ChatId | null
        +userConfig: UserConfig | null
        +notifications: Notification[]
        +isLoading: boolean
        +isBlocked: boolean
        +availableChats: any[]
        +messages: Record~string, Message[]~
        +initVetKeyReactions()
        +chatUIActions
    }

    class EncryptedMessagingService {
        -RatchetInitializationService ratchetInitializationService
        -KeyManager keyManager
        -BackgroundWorker backgroundWorker
        +start()
        +enqueueSendMessage(chatId, content)
        +takeReceivedMessages()
        +skipMessagesAvailableLocally(chatId, numMessages)
        +getCurrentChatIds()
        +signalStopWorker()
    }

    class ChatUIActions {
        +initialize()
        +refreshChats()
        +loadChatMessages()
        +createDirectChat(receiver, symmetricKeyRotationDurationMinutes, messageExpirationDurationMinutes)
        +createGroupChat(otherParticipants, symmetricKeyRotationDurationMinutes, messageExpirationDurationMinutes)
        +sendMessage(chatId, content)
        +modifyGroupChatParticipants(groupChatId, groupModification)
        +rotateChatVetKey(chatId)
        +addNotification(notification)
        +removeNotification(id)
    }

    class ChatList {
        +chats: Chat[]
        +selectedChatId: ChatId | null
        +onChatSelect(chatId)
        +createDirectChat()
        +createGroupChat()
    }

    class ChatInterface {
        +chatId: ChatId
        +messages: Message[]
        +onSendMessage(content)
        +onRotateVetKey()
        +onModifyParticipants()
    }

    class Hero {
        +onConnect()
        +onDemo()
    }

    ChatStore --> EncryptedMessagingService : uses
    ChatStore --> ChatUIActions : provides
    ChatUIActions --> EncryptedMessagingService : uses
    ChatUIActions --> CanisterAPI : uses
    ChatList --> ChatStore : reads from
    ChatInterface --> ChatStore : reads from
    ChatInterface --> EncryptedMessagingService : sends messages
    Hero --> ChatStore : triggers initialization
```

### 4. Cryptographic Service Dependencies

```mermaid
classDiagram
    class EncryptedMessagingService {
        -RatchetInitializationService ratchetInitializationService
        -KeyManager keyManager
        -BackgroundWorker backgroundWorker
        +start()
        +enqueueSendMessage(chatId, content)
        +takeReceivedMessages()
        +skipMessagesAvailableLocally(chatId, numMessages)
        +getCurrentChatIds()
        +signalStopWorker()
    }

    class RatchetInitializationService {
        -VetKeyResharingService vetKeyResharingService
        -EncryptedCanisterCacheService encryptedCanisterCacheService
        +initializeRatchetStateAndReshareAndCacheIfNeeded(chatId, vetKeyEpoch)
        +cryptoKeyStateFromLocalStorage(chatId, vetKeyEpoch)
        +cryptoKeyStateFromRemoteCache(chatId, vetKeyEpoch)
        +cryptoKeyStateFromResharedVetKey(chatId, vetKeyEpoch)
        +fetchAndReshareAndCacheVetKey(chatId, vetKeyEpoch)
    }

    class KeyManager {
        -Map~string, Map~bigint, SymmetricRatchetState~~ symmetricRatchetStates
        +getCurrentChatIdStrs()
        +inductSymmetricRatchetState(chatId, vetKeyEpoch, state)
        +encryptNow(chatId, sender, senderMessageId, message)
        +decryptAtTimeAndEvolveIfNeeded(chatId, sender, senderMessageId, vetKeyEpoch, encryptedBytes, time)
        +doesChatHaveKeys(chatId)
        +doesChatHaveRatchetStateForEpoch(chatId, vetKeyEpoch)
        -lastVetKeyEpoch(chatId)
    }

    class SymmetricRatchetState {
        -CryptoKey cryptoKey
        -bigint symmetricRatchetEpoch
        -Date creationTime
        -Date rotationDuration
        +encryptNow(sender, senderMessageId, message)
        +decryptAtTimeAndEvolveIfNeeded(sender, senderMessageId, message, time)
        +evolve()
        +evolveTo(symmetricKeyEpoch)
        +peekAtEpoch(symmetricKeyEpoch)
        +getExpectedEpochAtTime(time)
    }

    class VetKeyResharingService {
        +reshareIbeEncryptedVetKeys(chatId, vetkeyEpoch, otherParticipants, vetKeyBytes)
        +fetchResharedIbeEncryptedVetKey(chatId, vetkeyEpoch)
    }

    class EncryptedCanisterCacheService {
        -EncryptedMaps encryptedMaps
        +fetchAndDecryptFor(chatId, vetKeyEpoch)
        +encryptAndStoreFor(chatId, vetKeyEpoch, cache)
    }

    class KeyStorageService {
        +getSymmetricKeyState(chatIdStr, vetKeyEpochStr)
        +saveSymmetricKeyState(chatIdStr, vetKeyEpochStr, keyState)
        +saveIbeDecryptionKey(keyBytes)
        +getIbeDecryptionKey()
    }

    EncryptedMessagingService --> RatchetInitializationService : depends on
    EncryptedMessagingService --> KeyManager : depends on
    RatchetInitializationService --> VetKeyResharingService : depends on
    RatchetInitializationService --> EncryptedCanisterCacheService : depends on
    RatchetInitializationService --> KeyStorageService : depends on
    KeyManager --> SymmetricRatchetState : manages
    RatchetInitializationService --> SymmetricRatchetState : creates
    VetKeyResharingService --> KeyStorageService : uses
    EncryptedCanisterCacheService --> KeyStorageService : complementary
```

### 5. Message Flow & Queue Management

```mermaid
classDiagram
    class EncryptedMessagingService {
        -Map~string, string[]~ sendingQueue
        -Map~string, Message[]~ receivingQueue
        -Map~string, EncryptedMessage[]~ receivingQueueToDecrypt
        -Map~string, bigint~ firstAccessibleMessageId
        -Map~string, bigint~ chatIdToCurrentNumberOfRemoteMessages
        -Map~string, bigint~ chatIdToCurrentNumberOfFetchedMessages
        -BackgroundWorker backgroundWorker
        +start()
        +enqueueSendMessage(chatId, content)
        +takeReceivedMessages()
        +skipMessagesAvailableLocally(chatId, numMessages)
        +getCurrentChatIds()
        +signalStopWorker()
        -handleOutgoingMessages()
        -pollForNewMessages()
        -decryptReceivedMessages()
    }

    class BackgroundWorker {
        -AbortController abortController
        -boolean isRunning
        +start(pollingCallback, sendingCallback)
        +abort()
        -workerLoop(pollingCallback, sendingCallback)
    }

    class Message {
        +string id
        +string chatId
        +string sender
        +string content
        +Date timestamp
        +string chatMessageId
        +bigint vetKeyEpoch
        +bigint symmetricRatchetEpoch
        +string senderMessageId
    }

    class EncryptedMessage {
        +Uint8Array content
        +EncryptedMessageMetadata metadata
    }

    class EncryptedMessageMetadata {
        +Principal sender
        +bigint timestamp
        +bigint vetkey_epoch
        +bigint symmetric_key_epoch
        +bigint chat_message_id
        +bigint sender_message_id
    }

    class UserMessage {
        +bigint vetkey_epoch
        +Uint8Array content
        +bigint symmetric_key_epoch
        +bigint message_id
    }

    EncryptedMessagingService --> BackgroundWorker : manages
    BackgroundWorker --> EncryptedMessagingService : calls callbacks
    EncryptedMessagingService --> Message : produces
    EncryptedMessagingService --> EncryptedMessage : receives
    EncryptedMessagingService --> UserMessage : sends
    EncryptedMessage --> EncryptedMessageMetadata : contains
    Message --> EncryptedMessage : decrypted from
    UserMessage --> EncryptedMessage : encrypted to
```

### 6. Key Lifecycle Management

```mermaid
classDiagram
    class KeyManager {
        -Map~string, Map~bigint, SymmetricRatchetState~~ symmetricRatchetStates
        +getCurrentChatIdStrs()
        +inductSymmetricRatchetState(chatId, vetKeyEpoch, state)
        +encryptNow(chatId, sender, senderMessageId, message)
        +decryptAtTimeAndEvolveIfNeeded(chatId, sender, senderMessageId, vetKeyEpoch, encryptedBytes, time)
        +doesChatHaveKeys(chatId)
        +doesChatHaveRatchetStateForEpoch(chatId, vetKeyEpoch)
        -lastVetKeyEpoch(chatId)
    }

    class SymmetricRatchetState {
        -CryptoKey cryptoKey
        -bigint symmetricRatchetEpoch
        -Date creationTime
        -Date rotationDuration
        +encryptNow(sender, senderMessageId, message)
        +decryptAtTimeAndEvolveIfNeeded(sender, senderMessageId, message, time)
        +evolve()
        +evolveTo(symmetricKeyEpoch)
        +peekAtEpoch(symmetricKeyEpoch)
        +getExpectedEpochAtTime(time)
    }

    class CacheableSymmetricRatchetState {
        -Uint8Array rawKey
        -bigint symmetricRatchetEpoch
        -Date creationTime
        -Date rotationDuration
        +evolve()
        +evolveTo(symmetricKeyEpoch)
        +peekAtEpoch(symmetricKeyEpoch)
        +toSymmetricRatchetState()
        +static initializeFromVetKey(vetKey, creationTime, rotationDuration)
        +serialize()
        +static deserialize(bytes)
    }

    class RatchetInitializationService {
        -VetKeyResharingService vetKeyResharingService
        -EncryptedCanisterCacheService encryptedCanisterCacheService
        +initializeRatchetStateAndReshareAndCacheIfNeeded(chatId, vetKeyEpoch)
        +cryptoKeyStateFromLocalStorage(chatId, vetKeyEpoch)
        +cryptoKeyStateFromRemoteCache(chatId, vetKeyEpoch)
        +cryptoKeyStateFromResharedVetKey(chatId, vetKeyEpoch)
        +fetchAndReshareAndCacheVetKey(chatId, vetKeyEpoch)
    }

    class KeyStorageService {
        +getSymmetricKeyState(chatIdStr, vetKeyEpochStr)
        +saveSymmetricKeyState(chatIdStr, vetKeyEpochStr, keyState)
        +saveIbeDecryptionKey(keyBytes)
        +getIbeDecryptionKey()
    }

    class EncryptedCanisterCacheService {
        -EncryptedMaps encryptedMaps
        +fetchAndDecryptFor(chatId, vetKeyEpoch)
        +encryptAndStoreFor(chatId, vetKeyEpoch, cache)
    }

    KeyManager --> SymmetricRatchetState : manages lifecycle
    SymmetricRatchetState --> CacheableSymmetricRatchetState : converts to/from
    RatchetInitializationService --> SymmetricRatchetState : creates
    RatchetInitializationService --> CacheableSymmetricRatchetState : creates
    RatchetInitializationService --> KeyStorageService : stores locally
    RatchetInitializationService --> EncryptedCanisterCacheService : stores remotely
    KeyManager --> RatchetInitializationService : gets states from
    SymmetricRatchetState --> CacheableSymmetricRatchetState : serializable form
```

These class diagrams show:

1. **Core Service Architecture**: How `EncryptedMessagingService` orchestrates the entire system using `KeyManager` and `RatchetInitializationService`

2. **Key Management & Storage**: The relationship between different storage services (`KeyStorageService`, `EncryptedCanisterCacheService`) and how they work with the `KeyManager`

3. **State Management & UI Integration**: How the chat store integrates with the encrypted messaging service and UI components

4. **Cryptographic Service Dependencies**: The dependency hierarchy and how cryptographic services interact

5. **Message Flow & Queue Management**: How messages flow through the system using queues and background workers

6. **Key Lifecycle Management**: The complete lifecycle of cryptographic keys from creation to storage to usage

The `KeyManager` is central to the system, managing the lifecycle of `SymmetricRatchetState` objects and coordinating with various storage and initialization services to ensure keys are available when needed for encryption/decryption operations.
