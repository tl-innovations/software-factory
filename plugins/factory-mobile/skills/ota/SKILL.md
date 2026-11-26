---
name: ota
description: Ship an over-the-air (EAS Update) JS/asset update to an Expo app safely. It checks that the change doesn't need a native build, verifies, publishes to preview first, then to production with human approval and an optional staged rollout. Use when asked to push an OTA update, hotfix the app without a store release, or publish an EAS Update.
argument-hint: "[branch/channel, default: production]"
disable-model-invocation: true
---

# OTA update (EAS Update)

Target: $ARGUMENTS (default: `mobile.otaChannel` in `.factory/product.json`, usually `production`).

## 1. Is it OTA-safe?

An OTA update can only change JavaScript and assets. It's **not** safe, and needs a store release
(`/factory-mobile:release`), if anything native changed since the build that users are running: native
dependencies, the Expo SDK, `app.json`/`app.config.*` (plugins, permissions, icons, splash), or the
`ios/` / `android/` folders.

- Compare against the last store release tag: `git diff --stat <tag>..HEAD -- package.json app.json "app.config.*" ios android`.
- Prefer `"runtimeVersion": { "policy": "fingerprint" }` in the app config. Then an incompatible update can't
  reach builds with a different native runtime. If the project doesn't use it, recommend it.

If it's not OTA-safe, stop and explain why.

## 2. Verify

Run the factory `verify` skill. Everything in `ci` must pass.

## 3. Preview first

```bash
npx eas-cli@latest update --branch preview --message "<summary>" --environment preview --non-interactive
```

Ask the human to check it on a preview build (iOS **and** Android).

## 4. Production (human-approved)

After an explicit "go":

```bash
npx eas-cli@latest update --branch production --message "<summary>" --environment production --non-interactive
```

For risky changes, add `--rollout-percentage 10` and increase it later. The guard hook asks for
confirmation on production updates. That's expected.

## 5. Rollback plan

Note the update group ID from the output. To roll back, republish the previous good update
(`npx eas-cli@latest update:list --branch production`, then `update:republish`). Put the rollback command in
your final report.
