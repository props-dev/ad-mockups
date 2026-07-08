# Ad Mockups

Self-contained, iframe-able HTML mockups of the ad placements Props runs. One file
(`v1/ad-mockup.html`) renders all placements; URL params (or an inline config block)
control platform, format, creator, ad copy, and media.

**Production URL:** `https://props-dev.github.io/ad-mockups/v1/ad-mockup.html`
**Demo matrix:** `https://props-dev.github.io/ad-mockups/v1/demo.html`

| Platform | Placement rendered |
|---|---|
| `facebook` | Mobile feed sponsored post (header, primary text, media, link card + CTA, reactions, action bar) |
| `facebook` + `placement=story` | Story ad (full-bleed 9:16, segmented progress bar, Sponsored header, swipe-up chevron + CTA pill) — dark theme |
| `tiktok` | In-feed ad (full-bleed 9:16, action rail, caption + Sponsored label, CTA banner) — dark theme |
| `google` | Demand Gen / Discover feed card (media, headline, Sponsored source row, CTA chip) |
| `youtube` | In-feed ad unit (thumbnail + Ad badge, headline, Sponsored · channel row, CTA) |
| `pinterest` | Promoted pin (2:3 rounded image, Save button, title, "Promoted by" row) |

Everything is inline (CSS, JS, SVG icons, placeholder art). The only network requests the
file makes are for the media/avatar URLs you pass in.

## The contract

The `v1/` param schema is a **versioned public API** — Bubble pages depend on it.

- Changes to `v1/` are **additive-only** (new params, new platform slugs). Renames,
  removals, or semantic changes ship as `v2/` at a new URL.
- The renderer stamps its version in the `ad-mockup-version` meta tag, a
  `[ad-mockup] v…` console line, and the `ad-mockup:height` postMessage — so any
  embed can tell you exactly what it rendered.
- Golden URLs (must always render — enforced by `tests/functional.spec.js`):
  - `v1/ad-mockup.html` → Facebook card, all defaults
  - `v1/ad-mockup.html?platform=tiktok&format=video&media=<url>&poster=<url>`
  - `v1/ad-mockup.html?platform=google&format=carousel&media=<a>|<b>|<c>`

## Parameters

Precedence: **query string → `window.AD_MOCKUP_PARAMS` → per-platform defaults.**
Empty values are ignored (safe for Bubble expressions that resolve empty).

| Param | Values | Default |
|---|---|---|
| `platform` | `facebook` \| `tiktok` \| `google` \| `youtube` \| `pinterest` | `facebook` |
| `placement` | `feed` \| `story` — Facebook only for now; other platforms ignore it | `feed` |
| `format` | `video` \| `image` \| `carousel` | `image` |
| `creator` | display name | `Creator Name` |
| `handle` | handle, no `@` | derived from `creator` |
| `avatar` | image URL | initials circle (color hashed from name) |
| `copy` | primary text / caption | platform-appropriate sample |
| `headline` | link-card / card headline (Google clamps at 40 chars, YouTube at 2 lines) | sample |
| `description` | secondary line — row is hidden when empty | empty |
| `cta` | button label | FB `Learn More`, TikTok `Shop now`, Google `Shop now`, YT `Visit site` |
| `domain` | display link (FB link card) | `props.co` |
| `business` | Google business name / YouTube channel / Pinterest advertiser | falls back to `creator` |
| `media` | media URL(s). Carousel: repeat the param (`media=a&media=b`) **or** pipe-separate one value (`media=a\|b\|c`). Never comma-separate. Video: first URL is the video file | placeholder tile |
| `poster` | video thumbnail URL | placeholder |
| `likes` / `comments` / `shares` / `views` | display strings (`1.2K` fine) | plausible defaults |
| `verified` | `1`/`0` — blue check (FB/TikTok) | `0` |
| `autoplay` | `1`/`0` — `0` shows tap-to-play overlay | `1` (YouTube: `0`) |
| `ratio` | media aspect, e.g. `1:1`, `4:5`, `1.91:1`, `16:9` | FB `1:1`, TikTok `9:16`, Google `1.91:1`, YT `16:9`, Pinterest `2:3` |

URL handling: protocol-relative Bubble CDN URLs (`//cdn.bubble.io/...`) are normalized to
`https:` automatically. Only `https:` (and `data:image/`) URLs are accepted. All text
params are HTML-escaped, and a CSP blocks external scripts/objects/fetch as
defense-in-depth.

## Bubble integration

### Recommended: one reusable element + hosted iframe

Build a single reusable element (e.g. `AdMockup`) with properties — `platform`,
`placement`, `format`, `creator`, `avatar`, `copy`, `headline`, `media`, `poster` —
containing one HTML element:

```html
<iframe
  src="https://props-dev.github.io/ad-mockups/v1/ad-mockup.html?platform=<platform>&placement=<placement>&format=<format>&creator=<creator:URL encode>&copy=<copy:URL encode>&media=<media:URL encode>&poster=<poster:URL encode>"
  style="width:100%;height:100%;border:0" loading="lazy"></iframe>
```

Every dynamic value gets Bubble's `:URL encode`. For carousels, `:join with "|"` the
image list **before** the `:URL encode`. Instantiate the reusable anywhere (episode
pages, repeating-group cells) and feed the properties from the data.

**Platform mapping belongs in the data layer:** add a `mockup_slug` attribute to the
Platform option set (`Facebook Ads` → `facebook`, etc.) and reference it, instead of
scattering `:formatted as text` conditionals across pages. Do the same for placement
(`Feed` → `feed`, `Stories` → `story`); the renderer ignores `placement` on platforms
that don't have a story variant, so it's always safe to pass.

Caveats:
- Keep the total URL under **~2,000 characters** (Bubble's recommendation). Long copy +
  several CDN carousel URLs can exceed it — fall back to Pattern A or C below.
- iframes/scripts render in Preview/run mode only; the editor canvas shows a blank
  element. Expected.

### Pattern A — paste the file into an HTML element

Paste all of `v1/ad-mockup.html` into a Bubble HTML element, tick **"Display as an
iFrame"**, and set params in the `window.AD_MOCKUP_PARAMS` block using
**`:formatted as JSON-safe`** (it outputs a quoted, escaped string — don't add your own
quotes):

```js
window.AD_MOCKUP_PARAMS = {
  platform: "tiktok",
  format: "video",
  creator: Current cell's Episode's Creator's Name:formatted as JSON-safe,
  copy: Current cell's Episode's Ad Copy:formatted as JSON-safe,
  media: Current cell's Creative's Video URL:formatted as JSON-safe,
};
```

There is no character limit on Bubble HTML element content (the "10,000 chars" figure
floating around is Bubble's elements-per-page limit). Downsides: N pasted copies to
maintain, and Bubble re-renders the whole element when dynamic data changes (flicker,
video restarts). Prefer the hosted reusable.

### Pattern C — live param updates via postMessage

The page listens for messages, so a hosted iframe can update without a reload
(no flicker, video keeps playing). From a Bubble workflow (Toolbox → Run JavaScript):

```js
document.querySelector("#ad-preview iframe").contentWindow.postMessage(
  { type: "ad-mockup:params", params: { copy: "New copy", format: "image" } }, "*");
```

The page also broadcasts `{ type: "ad-mockup:height", height, version }` on every
resize for auto-sizing embeds.

### Suggested iframe sizes

| Platform | Size (px) | Notes |
|---|---|---|
| `facebook` | 375 × 660 | 1:1 media; ~740 tall for `ratio=4:5` |
| `facebook` story | 375 × 667 | Fills whatever height you give it (9:16 look) |
| `tiktok` | 375 × 667 | Fills whatever height you give it (9:16 look) |
| `google` | 375 × 440 | Shorter without `description` |
| `youtube` | 375 × 420 | |
| `pinterest` | 375 × 700 | 2:3 image + title + Promoted-by row |

## Rollout

1. Pilot on one episode page; keep the existing Bubble `generate-*-mockups-*` flows
   untouched.
2. Fidelity review with the media team (they live in the real ad managers).
3. Broaden to Creative Hub / Episode Blueprint; only then consider deprecating the
   overlapping server-side mockup generation.

Because the reusable points at a versioned URL, rollout/rollback of renderer changes is
a one-line edit in one Bubble element.

## Development & testing

```bash
npm install && npx playwright install chromium
npm run demo        # http://localhost:4173/v1/demo.html — full matrix + edge cases
npm test            # functional/contract tests (CI-enforced)
npm run test:visual # screenshot regression (OS-specific baselines, run locally)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the change rules (additive-only contract,
self-contained file, version bumps) and how to add a platform.

## Repo layout

```
v1/ad-mockup.html   the renderer (the only file Bubble consumes)
v1/demo.html        demo/QA matrix (published)
index.html          landing page (published)
tests/              Playwright functional + visual suites (not published)
.github/workflows/  ci.yml (tests on PR/push), deploy-pages.yml (Pages on main)
```
