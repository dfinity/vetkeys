# Releasing

This repo ships three independent libraries. Each has its own versioning,
changelog, and release process.

- [`@icp-sdk/vetkeys` (npm)](#icp-sdkvetkeys-npm)
- [`ic-vetkeys` (Rust crate)](#ic-vetkeys-rust-crate)
- [`ic-vetkeys` (Motoko / mops)](#ic-vetkeys-motoko--mops)

---

## `@icp-sdk/vetkeys` (npm)

**Source:** [`frontend/ic_vetkeys/`](frontend/ic_vetkeys/)  
**Registry:** [npmjs.com/package/@icp-sdk/vetkeys](https://www.npmjs.com/package/@icp-sdk/vetkeys)  
**Changelog:** [`frontend/ic_vetkeys/CHANGELOG.md`](frontend/ic_vetkeys/CHANGELOG.md)

Releases are triggered by pushing a `npm/X.Y.Z` tag to `main`. The
[`release-npm`](.github/workflows/release-npm.yml) workflow then publishes to npm automatically.

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

3. **Update [`frontend/ic_vetkeys/CHANGELOG.md`](frontend/ic_vetkeys/CHANGELOG.md)** — replace the `Unreleased` marker with today's date:
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD
   ```

4. **Commit, push, and open a PR** targeting `main`:
   ```bash
   git commit -am "chore: release @icp-sdk/vetkeys X.Y.Z"
   git push -u origin release/npm-X.Y.Z
   ```

5. **After the PR is merged**, optionally run a dry-run first to verify the build and package before tagging:
   - Go to **Actions → release-npm → Run workflow**, leave `dry-run` checked.

6. **Tag the merge commit on `main`** and push the tag:
   ```bash
   git checkout main && git pull
   git tag npm/X.Y.Z
   git push origin npm/X.Y.Z
   ```

   The CI workflow triggers on the tag push and publishes to npm.

7. **Deploy the API docs** — go to **Actions → Deploy docs to GitHub Pages → Run workflow** and enter the tag `npm/X.Y.Z`. This updates the [online docs](https://dfinity.github.io/vetkeys/) to reflect the new release.

### First-time setup (one-off, before the very first release)

Publishing uses GitHub OIDC — the npm CLI exchanges the GitHub Actions OIDC token for a short-lived publish token at runtime. No stored npm secret is needed. However, because `@icp-sdk/vetkeys` does not yet exist on npm, an **`@icp-sdk` npm org admin** must authorise this repo before the first publish:

1. Log into [npmjs.com](https://www.npmjs.com) as an `@icp-sdk` org admin.
2. Go to **`@icp-sdk` org settings → Publishing Access** (or the equivalent OIDC / Trusted Publishers section).
3. Check whether publishing new packages from `dfinity/*` GitHub repos is already permitted org-wide.
   - If yes: no action needed — the dry-run in step 5 above will confirm everything works.
   - If no: add `dfinity/vetkeys` as a trusted publisher (repository: `dfinity/vetkeys`, workflow: `.github/workflows/release-npm.yml`, environment: `release`).
4. Confirm by running the dry-run workflow (step 5) — a successful dry-run means auth is wired correctly and the real publish will work.

> This setup is identical to what was done for `@icp-sdk/core` (`dfinity/icp-js-core`) and `@icp-sdk/bindgen` (`dfinity/icp-js-bindgen`). Once `@icp-sdk/vetkeys` exists on npm after the first release, all future releases are fully automated with no further admin steps.

### Notes

- The `npm/` prefix scopes JS/TS release tags from Rust and Motoko release tags in this repo.
- Publishing uses GitHub OIDC (`id-token: write` + `NPM_CONFIG_PROVENANCE=true`): the npm CLI exchanges the GitHub Actions OIDC token for a short-lived publish token at runtime. No stored npm secret is needed. The `release` GitHub environment must exist on this repo (already configured).

---

## `ic-vetkeys` (Rust crate)

**Source:** [`backend/rs/ic_vetkeys/`](backend/rs/ic_vetkeys/)  
**Registry:** [crates.io/crates/ic-vetkeys](https://crates.io/crates/ic-vetkeys)  
**Changelog:** [`backend/rs/ic_vetkeys/CHANGELOG.md`](backend/rs/ic_vetkeys/CHANGELOG.md)

Publishing is triggered manually via the
[`publish`](.github/workflows/publish.yml) workflow. After publishing, a
`rust/X.Y.Z` tag must be pushed to `main` to mark the release commit.

### Steps

1. **Create a release branch** off `main`:
   ```bash
   git checkout main && git pull
   git checkout -b release/rust-X.Y.Z
   ```

2. **Bump the version** in [`backend/rs/ic_vetkeys/Cargo.toml`](backend/rs/ic_vetkeys/Cargo.toml):
   ```toml
   version = "X.Y.Z"
   ```

3. **Update [`backend/rs/ic_vetkeys/CHANGELOG.md`](backend/rs/ic_vetkeys/CHANGELOG.md)** — replace the `Unreleased` marker with today's date:
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD
   ```

4. **Commit, push, and open a PR** targeting `main`:
   ```bash
   git commit -am "chore: release ic-vetkeys at vX.Y.Z"
   git push -u origin release/rust-X.Y.Z
   ```

5. **After the PR is merged**, optionally run a dry run to verify the crate builds and packages correctly before publishing:
   - Go to **Actions → Publish ic-vetkeys to crates.io → Run workflow**, enter `X.Y.Z` as the crate version, and enable `dry-run`.

6. **Publish the crate**:
   - Go to **Actions → Publish ic-vetkeys to crates.io → Run workflow**, enter `X.Y.Z` as the crate version, and leave `dry-run` disabled.

   The workflow checks that the version in `Cargo.toml` matches the input, builds and tests the crate, then publishes to crates.io.

7. **Tag the merge commit on `main`** and push the tag:
   ```bash
   git checkout main && git pull
   git tag rust/X.Y.Z
   git push origin rust/X.Y.Z
   ```

---

## `ic-vetkeys` (Motoko / mops)

> **TODO:** Document and verify the release process for the Motoko mops package.
