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

### Publishing setup (already configured — no per-release admin steps)

Publishing uses GitHub OIDC trusted publishing (`id-token: write` + `NPM_CONFIG_PROVENANCE=true`) — the npm CLI exchanges the GitHub Actions OIDC token for a short-lived publish token at runtime. **No stored npm secret is needed.** This is a one-time org setup and it is done: `@icp-sdk/vetkeys` is published and a **trusted publisher** is registered on npmjs.com, so the steps above are fully automated.

If the trusted publisher ever needs to be re-checked (an `@icp-sdk` npm org admin, under the package's *Settings → Trusted Publisher*), it must match this workflow **exactly** — all fields are case-sensitive:

| Field | Value |
| --- | --- |
| Repository | `dfinity/vetkeys` |
| Workflow filename | `release-npm.yml` |
| Environment | `release` |

### Requirements the workflow must keep (do not regress)

OIDC trusted publishing is implemented by the **npm CLI** and requires **npm ≥ 11.5.1** (Node ≥ 22.14). `release-npm.yml` therefore:

- runs on **Node 24** (which bundles a new-enough npm), and
- publishes with **`npm publish`**, not `pnpm publish` — pnpm does not perform the OIDC exchange, so it falls back to the placeholder auth token and the publish fails with a masked `404`.

Downgrading Node below 24, or switching back to `pnpm publish`, will break publishing.

### Notes

- The `npm/` prefix scopes JS/TS release tags apart from the Rust (`rust/`) and Motoko release tags in this repo.
- The `release` GitHub environment must exist (already configured), and its deployment **tag** policy must allow `npm/*`. A plain `*` tag rule does **not** match a tag containing a slash (e.g. `npm/0.5.0`), so the prefixed pattern is required.

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

**Source:** [`backend/mo/ic_vetkeys/`](backend/mo/ic_vetkeys/)  
**Registry:** [mops.one/ic-vetkeys](https://mops.one/ic-vetkeys)  
**Changelog:** [`backend/mo/ic_vetkeys/CHANGELOG.md`](backend/mo/ic_vetkeys/CHANGELOG.md)

Releases are triggered by pushing a `motoko/X.Y.Z` tag to `main`. The
[`publish-mops`](.github/workflows/publish-mops.yml) workflow then publishes to
the mops registry automatically.

### Steps

1. **Create a release branch** off `main`:
   ```bash
   git checkout main && git pull
   git checkout -b release/motoko-X.Y.Z
   ```

2. **Bump the version** in [`backend/mo/ic_vetkeys/mops.toml`](backend/mo/ic_vetkeys/mops.toml):
   ```toml
   version = "X.Y.Z"
   ```

3. **Update [`backend/mo/ic_vetkeys/CHANGELOG.md`](backend/mo/ic_vetkeys/CHANGELOG.md)** — replace the `Unreleased` marker with today's date:
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD
   ```

4. **Commit, push, and open a PR** targeting `main`:
   ```bash
   git commit -am "chore: release ic-vetkeys (Motoko) at vX.Y.Z"
   git push -u origin release/motoko-X.Y.Z
   ```

5. **Tag the merge commit on `main`** and push the tag:
   ```bash
   git checkout main && git pull
   git tag motoko/X.Y.Z
   git push origin motoko/X.Y.Z
   ```

   The workflow triggers on the tag push. It first checks that `mops.toml`
   matches the tag version, then installs dependencies, runs the package tests,
   and publishes to the mops registry.

> **No publish dry-run:** unlike npm, `mops publish` has no `--dry-run`, so there
> is no dry-run step before tagging. Build, compile, and `mops test` are already
> validated by CI on `main` before you tag; the workflow's inline
> version-matches-tag check is the only remaining pre-publish guard. The one
> failure that cannot be caught ahead of time is publishing a version that
> already exists — the registry rejects it, and it fails cleanly (bump the
> version and re-tag).

### Publishing setup (already configured — no per-release admin steps)

- The **`mops-publish`** GitHub Environment holds the `MOPS_IDENTITY_PEM` secret
  (the mops publishing identity). The publish job declares `environment:
  mops-publish` so the secret resolves.
- Because publishing is **tag-triggered**, the environment's deployment-**tag**
  policy must allow `motoko/*`. A plain `*` tag rule does **not** match a tag
  containing a slash (e.g. `motoko/0.6.0`), so the prefixed pattern is required —
  the same requirement as `npm/*` for the `release` environment above.

### Notes

- The `motoko/` prefix scopes Motoko release tags apart from the Rust (`rust/`)
  and JS/TS (`npm/`) tags.
- Every action in the workflow is pinned to an exact commit SHA (with a version
  comment), per repo convention. `dfinity/setup-dfx` has no tagged release, so it
  is pinned to its `main` HEAD commit; bump that pin deliberately when updating.
