---
name: audit
description: Audit a website's quality covering performance (Core Web Vitals), accessibility, SEO basics and security headers, using Lighthouse, HTTP checks and code review, then produce a prioritized report. Use when asked to audit, check quality, speed, accessibility or SEO of the site or of a preview deployment.
argument-hint: "[url, default: local production build]"
---

# Web quality audit

Target: $ARGUMENTS

## 1. Pick the target

- If a URL was given, use it (production, or a PR preview deployment).
- Otherwise build and serve locally: `commands.build` from `.factory/product.json`, then the framework's
  production server (e.g. `npm run start`) in the background, then audit `http://localhost:<port>`.
  Stop the server when you're done.
- Audit the 3-5 most important routes (home, a key landing page, a form/checkout page, a content page)
  unless the user names specific ones.

## 2. Run the checks

Write raw output to `.factory-audit/` (make sure it's in `.gitignore`, and never commit it).

1. **Lighthouse** for each route (mobile emulation is the default):
   `npx lighthouse <url> --output=json --output-path=.factory-audit/<route>.json --quiet --chrome-flags="--headless=new"`
   Extract the category scores (performance, accessibility, best-practices, seo), LCP/CLS/TBT, and the top 5
   failed audits by impact.
2. **Security headers**: `curl -sI <url>`. Check `Content-Security-Policy`, `Strict-Transport-Security`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and clickjacking
   protection (`frame-ancestors` or `X-Frame-Options`).
3. **SEO basics**: a unique `<title>` and meta description on each route, `<link rel="canonical">`,
   Open Graph and Twitter tags, `/robots.txt`, `/sitemap.xml`, a real 404 status for unknown routes,
   and structured data where it's relevant.
4. **Code review for accessibility.** Lighthouse catches only part of it. Grep the components for images
   without `alt`, inputs without labels, click handlers on non-interactive elements, `outline: none`
   with no focus replacement, and heading order.

## 3. Report

Write `docs/audits/YYYY-MM-DD-audit.md` with:

- A score table per route (perf / a11y / best practices / SEO), with LCP, CLS and TBT.
- **Top 10 fixes**, ranked by user impact ÷ effort. Each one needs evidence (the audit id, `path:line`,
  or a header) and a concrete fix.
- What looks good, so nobody "fixes" it later.

Then ask whether to file the top items as GitHub issues (`gh issue create --label audit`), or fix the quick
wins now on a `chore/audit-fixes` branch through the factory pipeline.
