# Releasing

This repo ships three independent libraries. Each has its own versioning,
changelog, and release process.

---

## `@icp-sdk/vetkeys` (npm)

**Source:** [`frontend/ic_vetkeys/`](frontend/ic_vetkeys/)  
**Registry:** [npmjs.com/package/@icp-sdk/vetkeys](https://www.npmjs.com/package/@icp-sdk/vetkeys)  
**Changelog:** [`frontend/ic_vetkeys/CHANGELOG.md`](frontend/ic_vetkeys/CHANGELOG.md)

Releases are triggered by pushing a `npm/X.Y.Z` tag to `main`. The
[`release-npm`](.github/workflows/release-npm.yml) workflow then publishes to
npm and creates a GitHub release automatically.

### Steps

1. **Create a release branch** off `main`:
   ```bash
   git checkout main && git pull
   git checkout -b release/npm-X.Y.Z
   ```

2. **Bump the version** in [`frontend/ic_vetkeys/package.json`](frontend/ic_vetkeys/package.json):
   ```json
   "version": "X.Y.Z"
   ```

3. **Update [`frontend/ic_vetkeys/CHANGELOG.md`](frontend/ic_vetkeys/CHANGELOG.md)** — add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top.

4. **Commit, push, and open a PR** targeting `main`:
   ```bash
   git commit -am "chore: release @icp-sdk/vetkeys X.Y.Z"
   git push -u origin release/npm-X.Y.Z
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

- The `npm/` prefix scopes JS/TS release tags from Rust and Motoko release tags in this repo.
- Publishing requires the `NPM_TOKEN` secret and the `release` GitHub environment to be configured.
- After publishing a new version under a new package name, deprecate the old one on npm (requires npm org access):
  ```bash
  npm deprecate @dfinity/vetkeys "Moved to @icp-sdk/vetkeys"
  ```

---

## `ic-vetkeys` (Rust crate)

**Source:** [`backend/rs/ic_vetkeys/`](backend/rs/ic_vetkeys/)  
**Registry:** [crates.io/crates/ic-vetkeys](https://crates.io/crates/ic-vetkeys)  
**Changelog:** [`backend/rs/ic_vetkeys/CHANGELOG.md`](backend/rs/ic_vetkeys/CHANGELOG.md)

Publishing is done via the
[`publish-ic-vetkeys`](.github/workflows/publish-ic-vetkeys.yml)
`workflow_dispatch` workflow. It validates that the version in `Cargo.toml`
matches the input version before publishing.

### Steps

1. **Create a release branch** off `main`:
   ```bash
   git checkout main && git pull
   git checkout -b release/ic-vetkeys-X.Y.Z
   ```

2. **Bump the version** in [`backend/rs/ic_vetkeys/Cargo.toml`](backend/rs/ic_vetkeys/Cargo.toml):
   ```toml
   version = "X.Y.Z"
   ```

3. **Update [`backend/rs/ic_vetkeys/CHANGELOG.md`](backend/rs/ic_vetkeys/CHANGELOG.md)** — add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top.

4. **Commit, push, and open a PR** targeting `main`:
   ```bash
   git commit -am "chore: release ic-vetkeys X.Y.Z"
   git push -u origin release/ic-vetkeys-X.Y.Z
   ```

5. **After the PR is merged**, trigger the publish workflow from GitHub Actions:
   - Go to **Actions → Publish ic-vetkeys to crates.io → Run workflow**
   - Set `crate-version` to `X.Y.Z`
   - Optionally run with `dry-run: true` first to verify everything looks correct

---

## `ic-vetkeys` (Motoko / mops)

**Source:** [`backend/mo/ic_vetkeys/`](backend/mo/ic_vetkeys/)  
**Registry:** [mops.one/ic-vetkeys](https://mops.one/ic-vetkeys)  
**Changelog:** [`backend/mo/ic_vetkeys/CHANGELOG.md`](backend/mo/ic_vetkeys/CHANGELOG.md)

Publishing is done manually using the `mops` CLI.

### Steps

1. **Create a release branch** off `main`:
   ```bash
   git checkout main && git pull
   git checkout -b release/mo-ic-vetkeys-X.Y.Z
   ```

2. **Bump the version** in [`backend/mo/ic_vetkeys/mops.toml`](backend/mo/ic_vetkeys/mops.toml):
   ```toml
   version = "X.Y.Z"
   ```

3. **Update [`backend/mo/ic_vetkeys/CHANGELOG.md`](backend/mo/ic_vetkeys/CHANGELOG.md)** — add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top.

4. **Commit, push, and open a PR** targeting `main`:
   ```bash
   git commit -am "chore: release mo/ic-vetkeys X.Y.Z"
   git push -u origin release/mo-ic-vetkeys-X.Y.Z
   ```

5. **After the PR is merged**, publish from the library directory:
   ```bash
   git checkout main && git pull
   cd backend/mo/ic_vetkeys
   mops publish
   ```
