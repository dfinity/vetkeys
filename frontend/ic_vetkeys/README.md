[![documentation](https://img.shields.io/badge/documentation-online-blue)](https://dfinity.github.io/vetkeys/)

# Internet Computer (ICP) VetKeys

<br>

This package contains three entry points:

<br>

[`@icp-sdk/vetkeys`](https://dfinity.github.io/vetkeys/)

---

Provides frontend utilities for the low-level use of VetKeys such as decryption of encrypted VetKeys, identity based encryption (IBE), and symmetric key derivation from a VetKey.

<br>

[`@icp-sdk/vetkeys/key_manager`](https://dfinity.github.io/vetkeys/)

---

A frontend library facilitating communication with a [key manager enabled canister](https://docs.rs/ic-vetkeys/latest/ic_vetkeys/key_manager/struct.KeyManager.html).

<br>

[`@icp-sdk/vetkeys/encrypted_maps`](https://dfinity.github.io/vetkeys/)

---

A frontend library facilitating communication with an [encrypted maps enabled canister](https://docs.rs/ic-vetkeys/latest/ic_vetkeys/encrypted_maps/struct.EncryptedMaps.html).

<br>

## Releasing a new version

Releases are triggered by pushing a `npm/X.Y.Z` tag to `main`. The [`release-npm`](../../.github/workflows/release-npm.yml) workflow then publishes to npm and creates a GitHub release automatically.

### Steps

1. **Create a release branch** off `main`:
   ```bash
   git checkout main && git pull
   git checkout -b release/X.Y.Z
   ```

2. **Bump the version** in [`package.json`](package.json):
   ```json
   "version": "X.Y.Z"
   ```

3. **Update [`CHANGELOG.md`](CHANGELOG.md)** — add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top with the changes for this release.

4. **Commit, push, and open a PR** targeting `main`:
   ```bash
   git commit -am "chore: release X.Y.Z"
   git push -u origin release/X.Y.Z
   ```

5. **After the PR is merged**, tag the merge commit on `main` and push the tag:
   ```bash
   git checkout main && git pull
   git tag npm/X.Y.Z
   git push origin npm/X.Y.Z
   ```

   The CI workflow triggers on the tag push and handles publishing.

### Beta releases

Follow the same steps but use a `npm/X.Y.Z-beta.N` tag (e.g. `npm/0.5.0-beta.1`). The package will be published to npm with the `beta` dist-tag.

### Notes

- The `npm/` prefix scopes JS/TS release tags from Rust and Motoko release tags in this multi-library repo.
- Publishing requires the `NPM_TOKEN` secret and the `release` GitHub environment to be configured.
- After publishing a new version, deprecate the previous namespace on npm if applicable (requires `@dfinity` npm org access):
  ```bash
  npm deprecate @dfinity/vetkeys "Moved to @icp-sdk/vetkeys"
  ```
