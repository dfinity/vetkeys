# Encrypted notes: vetKD

| Motoko backend | [![](https://icp.ninja/assets/open.svg)](http://icp.ninja/editor?g=https://github.com/dfinity/vetkeys/tree/main/examples/encrypted_notes_dapp_vetkd/motoko)|
| --- | --- |
| Rust backend | [![](https://icp.ninja/assets/open.svg)](http://icp.ninja/editor?g=https://github.com/dfinity/vetkeys/tree/main/examples/encrypted_notes_dapp_vetkd/rust) |

This is a copy of the [`encrypted-notes-dapp` example](https://github.com/dfinity/examples/tree/master/motoko/encrypted-notes-dapp), adapted to use [vetKeys](https://internetcomputer.org/docs/building-apps/network-features/vetkeys/introduction) and add sharing of notes between users.

In particular, instead of creating a principal-specific AES key and syncing it across devices (using device-specific RSA keys), the notes are encrypted with an AES key that is derived (directly in the browser) from a note-ID-specific vetKey obtained from the backend canister (in encrypted form, using an ephemeral transport key), which itself obtains it from the vetKD system API. This way, there is no need for any device management in the dapp, plus sharing of notes becomes possible.

The vetKey used to encrypt and decrypt a note is note-ID-specific (and not, for example, principal-specific) to enable the sharing of notes between users. The derived AES keys are stored as non-extractable CryptoKeys in an IndexedDB in the browser for efficiency so that their respective vetKey only has to be fetched from the server once. To improve the security even further, the vetKeys' derivation information could be adapted to include a (numeric) epoch that advances each time the list of users with which the note is shared is changed.

Currently, the only way to use this dapp is via manual local deployment (see below).

Please also see the [README of the original encrypted-notes-dapp](https://github.com/dfinity/examples/tree/master/motoko/encrypted-notes-dapp/README.md) for further details.

## Prerequisites

This example requires an installation of:

- [x] Install the [IC SDK](https://internetcomputer.org/docs/current/developer-docs/setup/install/index.mdx).
- [x] Install [npm](https://www.npmjs.com/package/npm).

## Deploy the Canisters

If you want to deploy this project locally with a Motoko backend, then run:
```bash
dfx start --background && dfx deploy
```
from the `motoko` folder.

To use the Rust backend instead of Motoko, run the same command in the rust folder.

## Troubleshooting

If you run into issues, clearing all the application-specific IndexedDBs in the browser (which are used to store Internet Identity information and the derived non-extractable AES keys) might help fix the issue. For example in Chrome, go to Inspect → Application → Local Storage → `http://localhost:3000/` → Clear All, and then reload.
