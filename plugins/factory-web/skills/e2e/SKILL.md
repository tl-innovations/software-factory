---
name: e2e
description: Write and run Playwright end-to-end tests that map to a spec's acceptance criteria (or a smoke suite for key user journeys), and wire them into the product's CI. Use when asked for end-to-end, browser or user-journey tests on a web product.
argument-hint: "[spec path | journey description]"
---

# End-to-end tests with Playwright

Scope: $ARGUMENTS (a spec's acceptance criteria, or the product's critical journeys if no spec is given).

1. **Check the setup.** Look for `playwright.config.*` and `@playwright/test` in `package.json`.
   If it's missing, explain what you'd add (the `@playwright/test` dev dependency, a config with a
   `webServer` entry that starts the app, and an `e2e/` folder). **Ask before installing.** Then follow
   Playwright's official init (`npm init playwright@latest`) and keep the default folder layout.
2. **Write the tests.**
   - One `test()` per acceptance criterion, named `AC<n>: <behaviour>`, grouped by spec in a
     `test.describe('<NNNN spec title>')`.
   - Use role-based locators (`getByRole`, `getByLabel`, `getByText`). Avoid CSS/XPath selectors and
     `waitForTimeout`, and rely on web-first assertions (`await expect(locator).toBeVisible()`).
   - Keep tests independent. Seed state through the UI or API helpers, never through test ordering.
   - Add at least one mobile-viewport project (e.g. `devices['iPhone 15']`) for responsive behaviour.
3. **Run them** with `npx playwright test` (narrow with a file path or `-g`). On failure, check the trace or
   report (`npx playwright show-report`) before changing anything. Fix the app if it's wrong, and the test
   if the test is wrong.
4. **Wire them into the factory.** Set `commands.e2e` in `.factory/product.json` to `npx playwright test`,
   and with the user's agreement add `"e2e"` to `ci` (CI installs browsers automatically when the command
   uses Playwright). Don't add e2e to `gates.onStop`, because it's too slow.
