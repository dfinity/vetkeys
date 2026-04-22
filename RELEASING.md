# Releasing @icp-sdk/vetkeys

Releases are triggered by pushing a `npm/X.Y.Z` tag to `main`. The
[`release-npm`](.github/workflows/release-npm.yml) workflow then publishes to
npm and creates a GitHub release automatically.

## Steps

1. **Create a release branch** off `main`:
   ```bash
   git checkout main && git pull
   git checkout -b release/X.Y.Z
   ```

2. **Bump the version** in [`frontend/ic_vetkeys/package.json`](frontend/ic_vetkeys/package.json):
   ```json
   "version": "X.Y.Z"
   ```

3. **Update [`frontend/ic_vetkeys/CHANGELOG.md`](frontend/ic_vetkeys/CHANGELOG.md)** — add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top with the changes for this release.

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

## Beta releases

Follow the same steps but use a `npm/X.Y.Z-beta.N` tag (e.g. `npm/0.5.0-beta.1`). The package will be published to npm with the `beta` dist-tag.

## Notes

- The `npm/` prefix scopes JS/TS release tags from Rust and Motoko release tags in this multi-library repo.
- Publishing requires the `NPM_TOKEN` secret and the `release` GitHub environment to be configured.
- After publishing a new version, deprecate the previous namespace on npm if applicable (requires `@dfinity` npm org access):
  ```bash
  npm deprecate @dfinity/vetkeys "Moved to @icp-sdk/vetkeys"
  ```
