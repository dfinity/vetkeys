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

### Notes

- The `npm/` prefix scopes JS/TS release tags from Rust and Motoko release tags in this repo.
- Publishing requires the `NPM_TOKEN` secret and the `release` GitHub environment to be configured.

---

## `ic-vetkeys` (Rust crate)

> **TODO:** Document and verify the release process for the Rust crate. See [`.github/workflows/release-rust.yml`](.github/workflows/release-rust.yml).

---

## `ic-vetkeys` (Motoko / mops)

> **TODO:** Document and verify the release process for the Motoko mops package.
