/**
 * @module ic_vetkeys/tools
 * @description Provides high-level tools for frontend integration with the Internet Computer (ICP) applications using the respective [`ic_vetkeys` backend tools](https://docs.rs/ic_vetkeys/latest/).
 *
 * > [!IMPORTANT]
 * > These support libraries are under active development and are subject to change. Access to the repositories has been opened to allow for early feedback. Check back regularly for updates.
 * >
 * > Please share your feedback on the [developer forum](https://forum.dfinity.org/t/threshold-key-derivation-privacy-on-the-ic/16560/179).
 *
 * ### [Encrypted Maps](https://5lfyp-mqaaa-aaaag-aleqa-cai.icp0.io/classes/ic_vetkeys_tools.EncryptedMaps.html)
 *
 * A frontend library facilitating communication with an [encrypted maps enabled canister](https://docs.rs/ic_vetkeys/latest/TODO).
 *
 * ### [Key Manager](https://5lfyp-mqaaa-aaaag-aleqa-cai.icp0.io/classes/ic_vetkeys_tools.KeyManager.html)
 *
 * A frontend library facilitating communication with a [key manager enabled canister](https://docs.rs/ic_vetkeys/latest/TODO).
 */

export { KeyManager, type KeyManagerClient } from "../key_manager/key_manager";
export { DefaultKeyManagerClient } from "../key_manager/key_manager_canister";
export {
    EncryptedMaps,
    type EncryptedMapsClient,
    type MapData,
} from "../encrypted_maps/encrypted_maps";
export { DefaultEncryptedMapsClient } from "../encrypted_maps/encrypted_maps_canister";
export * as ic_vetkeys_encrypted_maps_canister from "../declarations/ic_vetkeys_encrypted_maps_canister/index";
export * as ic_vetkeys_manager_canister from "../declarations/ic_vetkeys_manager_canister/index";
export {
    type AccessRights,
    type ByteBuf,
} from "../declarations/ic_vetkeys_manager_canister/ic_vetkeys_manager_canister.did";
