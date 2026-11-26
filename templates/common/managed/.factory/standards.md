<!-- Managed by the software factory ({{FACTORY_REPO}}). Edits here are overwritten by `factory sync`. -->

# Factory engineering standards

These apply to every product in the fleet. This product's own CLAUDE.md can add to them but
should not contradict them.

## The pipeline

Work moves through the same stages in every repo:

1. **Spec** (`/factory:spec`): a problem statement plus testable acceptance criteria in `docs/specs/`.
2. **Plan** (`/factory:plan`): the files to touch, the steps, and a test plan. Written before code.
3. **Build** (`/factory:feature` or `/factory:bugfix`): a feature branch with small, verifiable steps.
4. **Verify** (`/factory:verify`): every command in `.factory/product.json` → `ci` passes locally.
5. **Review** (`/factory:review`): the reviewer subagent checks the diff against the spec and these standards.
6. **Ship** (`/factory:ship`): a conventional commit, a push and a PR. **A human merges. Claude never does.**

How often Claude pauses for approval is set by `autonomy` in `.factory/product.json`:

- `supervised`: stop after the spec and after the plan.
- `standard`: stop after the spec.
- `autonomous`: no stops. It still ends at a PR.

When running non-interactively (CI, headless), never wait for approval. Put the spec and plan in
the PR description, and the human approves through PR review.

## Definition of done

- Every acceptance criterion in the spec is met and covered by an automated test where practical.
- `/factory:verify` is green. Don't claim something works without running it.
- No unrelated changes: refactors and drive-by fixes go in their own PR.
- User-visible changes are described in the PR, with screenshots for UI changes.
- New configuration or environment variables are documented in `.env.example` and the PR.

## Git

- Branches: `feat/<spec#>-<slug>`, `fix/<issue#>-<slug>`, `chore/<slug>`. Never commit to `main`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- One logical change per PR. Prefer PRs that can be reviewed in under 15 minutes.
- Never force-push shared branches, rewrite `main`, or skip hooks (`--no-verify`).

## Code

- Follow the existing patterns in this repo before inventing new ones. Read neighbouring code first.
- TypeScript strict. No `any` without a comment explaining why.
- Validate external input at the boundary (forms, API responses, URL params, deep links).
- Handle loading, empty and error states for anything async the user can see.
- Don't add a dependency when the platform or an existing dependency already covers it. A new dependency must be justified in the PR.

## Testing

- Bug fixes start with a failing test that reproduces the bug.
- Test behaviour through public interfaces, not implementation details.
- Never delete or weaken a failing test to make the build pass. Fix the code, or stop and explain.

## Security & privacy

- Secrets live in the hosting provider / EAS / GitHub secrets, never in the repo or in client bundles.
- Don't read `.env` files, keys or keystores. Use `.env.example` to learn which variables exist.
- Anything shipped to a browser or app binary is public. Only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` style values belong there.
- Escape user content, use parameterized queries, and check authorization on the server for every mutation.

## Web products

- Accessibility: semantic HTML, labelled controls, keyboard reachable, visible focus, colour contrast at WCAG 2.2 AA.
- Performance: watch Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1). Optimize images, and avoid shipping large client bundles.
- SEO basics on public pages: a unique title and meta description, canonical URL, Open Graph tags, sitemap and robots.

## Mobile products

- Know whether a change is **OTA-safe** (JS/assets only) or needs a **new native build** (native modules, permissions, app config, SDK upgrades). Say which in the PR.
- Production store submissions and production OTA updates are human-approved steps.
- Test on both iOS and Android, at small and large screen sizes. Respect safe areas and dynamic type.

## What Claude must never do

- Merge PRs, push to `main`/`master`, force-push, or delete branches it didn't create.
- Deploy to production, submit to app stores, or publish packages without explicit human instruction in this session.
- Edit files the factory manages (listed in `.factory/managed.json`). Propose the change to the factory repo instead.
- Paper over a failing check. Report it honestly.
