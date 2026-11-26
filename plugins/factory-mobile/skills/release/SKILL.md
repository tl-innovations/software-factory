---
name: release
description: Prepare and run an App Store / Google Play release for an Expo app with EAS. Covers preflight checks, deciding between a store build and an OTA update, the version bump, release notes, the human-approved build and submit, and tagging. Use when asked to release, ship to the stores, or cut a new app version.
argument-hint: "[ios | android | all]"
disable-model-invocation: true
---

# Mobile store release (Expo + EAS)

Platforms: $ARGUMENTS (default `all`).

## 1. Preflight (stop on any failure)

- On the default branch, clean, and up to date: `git status`, `git fetch`, `git status -sb`.
- CI is green on the latest commit: `gh run list --branch main --limit 3`.
- The factory `verify` skill passes. Also run `npx expo-doctor` and `npx expo install --check`.
- `eas.json` has a `production` profile, and `app.json`/`app.config.*` has the bundle id / package name.

## 2. Is a store build actually needed?

Find the last release tag (`git describe --tags --abbrev=0 --match "v*"`) and diff from it. A **new native
build** is needed if any of these changed: native dependencies (`expo-*` or `react-native-*` packages that
include native code), the Expo SDK version, `app.json`/`app.config.*` (plugins, permissions, icons, splash,
schemes), the `ios/` or `android/` folders, or the EAS build profile.

If only JS, TS or assets changed, recommend an **OTA update** (`/factory-mobile:ota`) instead and ask.

## 3. Version and notes

- Build numbers: with `"appVersionSource": "remote"` and `"autoIncrement": true` (the factory's
  `eas.json`), EAS manages them. Don't hand-edit them.
- The user-facing version (`expo.version`) follows semver. **Ask the human** whether it's a patch, minor
  or major bump, then update it in a `chore(release): vX.Y.Z` commit through a PR, or straight to main if
  the human says so.
- Release notes: summarize the user-visible `feat:` and `fix:` commits since the last tag
  (`git log <tag>..HEAD --oneline`) in plain language. Write a short version for Google Play (500 characters
  max) and a longer one for the App Store (4000 characters max).

## 4. Build and submit (human-approved)

Show the plan (version, platforms, notes) and **wait for an explicit "go"**. Then either:

- `npx eas-cli@latest workflow:run .eas/workflows/release.yml` (builds both platforms and submits), or
- `npx eas-cli@latest build --platform <p> --profile production`, then
  `npx eas-cli@latest submit --platform <p> --latest`

The factory guard hook will ask for confirmation on these commands. That's expected.

## 5. After

- Tag: `git tag vX.Y.Z && git push origin vX.Y.Z` (ask first).
- Store checklist for the human: screenshots updated if the UI changed, privacy labels / Data safety form if
  data collection changed, reviewer notes and a demo account, and export compliance answers.
- Report the build and submission links from the EAS output.
