# {{PRODUCT_NAME}}

> {{DESCRIPTION}}

<!--
  This file is owned by this product (the factory seeds it once, never overwrites it).
  Keep it under ~150 lines: facts Claude can't infer from the code. Run /factory:onboard
  to have Claude fill in the TODOs from the actual codebase.
-->

## Product

- **Type:** {{PRODUCT_TYPE}}
- **Who uses it / why:** TODO
- **Production:** TODO (URL, or App Store / Play Store listing)

## Stack

TODO: framework, language, styling, data and auth, hosting.

## Commands

The canonical commands live in `.factory/product.json` → `commands`. CI, the stop gate and
`/factory:verify` all read that file, so keep it accurate instead of listing commands here.

## Architecture map

TODO: the 5-10 directories that matter, and what lives in each.

## Product-specific conventions

TODO: anything that differs from the factory standards below.

## Gotchas

TODO: things that have bitten us before.

## Factory standards

@.factory/standards.md
