# Contributing

## Ground rules

1. **The v1 param schema is a public contract.** Bubble pages build URLs against
   it. Changes must be additive-only: new params, new platform slugs, new option
   values. Renaming/removing a param or changing a default's meaning is a
   breaking change → copy `v1/` to `v2/` and evolve there.
2. **`v1/ad-mockup.html` stays self-contained.** No external CSS/JS/fonts, no
   build step, no network requests except user-supplied media URLs. This is what
   makes it embeddable anywhere (including pasted directly into a Bubble HTML
   element).
3. Bump `VERSION` in the script **and** the `ad-mockup-version` meta tag on
   every change, and add a CHANGELOG entry.

## Local development

```bash
npm install
npx playwright install chromium   # once
npm run demo                      # serves on http://localhost:4173
open http://localhost:4173/v1/demo.html
```

`v1/demo.html` renders the full platform × format matrix plus edge cases, with
the exact URL above each cell.

## Testing

```bash
npm test                   # functional/contract tests (also run in CI)
npm run test:visual        # screenshot regression (local, OS-specific baselines)
npm run test:visual:update # refresh baselines after an intentional visual change
```

- Functional tests are deterministic and offline (data-URI media) — they must
  pass before merge; CI enforces them.
- Visual baselines live in `tests/__screenshots__/chromium-<os>/` and are
  OS-specific because of font rendering. Run the visual suite on the same OS as
  the committed baselines (currently darwin) before shipping visual changes.

## Adding a platform

1. Add a `PLATFORM_DEFAULTS.<slug>` entry (cta, ratio, sample copy).
2. Write a `render<Name>(p)` function composing the shared helpers
   (`avatarHtml`, `mediaHtml`, `copyHtml`, `esc`) and register it in `RENDERERS`.
3. Add a namespaced CSS block (`.xx-*`) — never restyle shared classes.
4. Update: the platform comment in the `AD_MOCKUP_PARAMS` block, `demo.html`
   (`SIZES` + platforms array), README platform + sizing tables, functional
   tests, and visual baselines.

## Deploy

Merging to `main` runs CI and publishes `index.html` + `v1/` to GitHub Pages
(everything else — tests, configs — is not published). The Bubble reusable
element should point at a versioned path so rollout/rollback is a one-line
change on the Bubble side.
