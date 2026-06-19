# Contributing

Thanks for helping improve this plugin. This document covers the branching
model, commit/PR naming rules, and how releases are produced.

## Local setup

Requires Node.js 22 or 24.

```sh
npm install      # installs deps and Git hooks (husky)
npm run build    # type-check and compile to dist/
npm test         # run the test suite
npm run lint     # eslint (use npm run format for prettier)
npm run watch    # build, npm link, and reload on change for live testing
```

## Branching model

The release pipeline flows **`latest` → `dev` → `beta` → `latest`**.

| Branch           | Purpose                              | On push                                  |
| ---------------- | ------------------------------------ | ---------------------------------------- |
| `latest`         | stable release channel               | publishes `x.y.z` to npm `@latest`       |
| `beta`           | pre-release channel                  | publishes `x.y.z-beta.n` to npm `@beta`  |
| `dev`            | integration / active development     | CI only (no publish)                     |
| feature branches | individual changes (`fix/…`, `feat/…`) | CI runs on the pull request            |

Typical cycle:

1. `dev` is cut from `latest` and tracks the next release.
2. Branch feature work off `dev` and open a pull request **into `dev`**. CI
   lints, builds, and tests it.
3. Promote `dev` → `beta`. Merging publishes a pre-release to npm `@beta`.
4. Once the pre-release is proven, promote `beta` → `latest`. Merging
   publishes the stable release to npm `@latest`.

> Use a regular merge (not squash) for the `dev → beta` and `beta → latest`
> promotions so release tags stay reachable. Feature PRs into `dev` are
> squash-merged.

You never edit the `version` in `package.json`, write a changelog, or create
GitHub Releases by hand — all of that is automated (see **Releases** below).

## Commit and PR naming

Commit messages **and pull request titles** must follow
[Conventional Commits](https://www.conventionalcommits.org/). This is what
decides the next version, so it is enforced:

- a local `commit-msg` hook (commitlint) rejects invalid commit messages, and
- a required **PR Title** check rejects invalid pull request titles.

> Feature PRs are squash-merged, so the **PR title becomes the released commit
> message**. Get the title right even if the individual commits were messy.

| Prefix                              | Release  | Example                                  |
| ----------------------------------- | -------- | ---------------------------------------- |
| `fix:`                              | patch    | `fix: correct speaker discovery timeout` |
| `feat:`                             | minor    | `feat: add volume control`               |
| `feat!:` or a `BREAKING CHANGE:` footer | major | `feat!: drop Homebridge v1 support`      |
| `chore:` / `docs:` / `ci:` / `test:` / `refactor:` | none | `chore: bump dev dependencies`  |

If a change should not trigger a release (tooling, docs, CI), use one of the
no-release types.

## Releases

Releases are fully automated with
[semantic-release](https://semantic-release.gitbook.io/) when commits land on
`beta` or `latest`. On a release-worthy commit it:

- determines the next version from the commit messages,
- publishes to npm (with provenance) on the matching dist-tag,
- creates the git tag, and
- creates a GitHub Release with notes generated from the commits.

Because release branches are protected, semantic-release does **not** commit a
version bump back to the repo — git tags are the source of truth, and the
changelog lives in the GitHub Releases, not a committed file.
