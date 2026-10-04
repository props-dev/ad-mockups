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
| `youtube` + `placement=shorts` | Shorts ad (full-bleed 9:16, like/dislike/comment/share rail, channel row + Sponsored + CTA) — dark theme |
| `youtube` + `placement=desktop` | Desktop watch-page in-stream ad (16:9 player with Ad chip, yellow scrubber, Skip button, companion CTA overlay + player controls; title, channel row with Subscribe, Like/Share/Save bar below) |
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
| `placement` | Surface within a platform. Facebook: `feed` \| `story`. YouTube: `feed` \| `shorts` \| `desktop`. Other platforms only have `feed`. Values not valid for the platform fall back to `feed`, so it's always safe to pass | `feed` |
| `format` | `video` \| `image` \| `carousel` | `image` |
| `creator` | display name | `Creator Name` |
| `handle` | handle, no `@` | derived from `creator` |
| `byline` | `handle` \| `name` - TikTok account line shows `@handle` or the `creator` display name without `@`; `name` wins even when `handle` is set | `handle` |
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
| `counts` | `1`/`0` - `0` hides engagement numbers and the Facebook feed counts row | `1` |
| `verified` | `1`/`0` — blue check (FB/TikTok) | `0` |
| `autoplay` | `1`/`0` — `0` shows tap-to-play overlay | `1` (YouTube: `0`) |
| `ratio` | media aspect, e.g. `1:1`, `4:5`, `1.91:1`, `16:9` | FB `1:1`, TikTok `9:16`, Google `1.91:1`, YT `16:9`, Pinterest `2:3` |

URL handling: protocol-relative Bubble CDN URLs (`//cdn.bubble.io/...`) are normalized to
`https:` automatically. Only `https:` (and `data:image/`) URLs are accepted. All text
params are HTML-escaped, and a CSP blocks external scripts/objects/fetch as
defense-in-depth.

## API reference (OpenAPI)

There's no server and no JSON API — the page **is** the endpoint. A `GET` of
`ad-mockup.html` with a query string returns a fully-rendered HTML preview. The spec
below is the machine-readable version of the parameter table above; paste it into any
OpenAPI tool (Swagger UI, Redoc, a client generator) to explore or build request URLs.

```yaml
openapi: 3.1.0
info:
  title: Props Ad Mockup Renderer
  version: 1.5.0
  description: >
    Self-contained HTML renderer for social ad-placement mockups. No server, no
    build, no JSON — a GET with a query string returns a rendered preview. Params
    within v1 are additive-only; breaking changes ship at /v2/. The only network
    requests the page makes are for the media/avatar URLs you pass in.
servers:
  - url: https://props-dev.github.io/ad-mockups
paths:
  /v1/ad-mockup.html:
    get:
      summary: Render an ad-placement mockup
      description: >
        Returns an HTML document rendering the requested placement. Unknown params
        are ignored; blank values fall back to the per-platform default. Precedence:
        query string > window.AD_MOCKUP_PARAMS (paste-in mode) > per-platform defaults.
      parameters:
        - name: platform
          in: query
          description: Which platform's placement to render.
          schema: { type: string, enum: [facebook, tiktok, google, youtube, pinterest], default: facebook }
        - name: placement
          in: query
          description: >
            Surface within the platform. facebook: feed | story. youtube:
            feed | shorts | desktop. Other platforms only have feed. A value not
            valid for the chosen platform falls back to feed.
          schema: { type: string, enum: [feed, story, shorts, desktop], default: feed }
        - name: format
          in: query
          schema: { type: string, enum: [image, video, carousel], default: image }
        - name: creator
          in: query
          description: Display name. Also seeds the handle and the initials avatar.
          schema: { type: string, default: Creator Name }
        - name: handle
          in: query
          description: Handle without '@'. Defaults to a slug derived from creator.
          schema: { type: string }
        - name: byline
          in: query
          description: TikTok account line. Name shows creator without '@' even when handle is set. Invalid values use handle.
          schema: { type: string, enum: [handle, name], default: handle }
        - name: avatar
          in: query
          description: Avatar URL (https or data:image only). Falls back to an initials circle.
          schema: { type: string, format: uri }
        - name: copy
          in: query
          description: Primary text / caption. Truncates with See-more (feed) or a hard ellipsis (story/shorts).
          schema: { type: string }
        - name: headline
          in: query
          description: Link-card / card / video headline. Google clamps at 40 chars.
          schema: { type: string }
        - name: description
          in: query
          description: Secondary line; its row is hidden when empty.
          schema: { type: string }
        - name: cta
          in: query
          description: Button label. Default is per-platform (Learn More / Shop now / Visit site / Save).
          schema: { type: string }
        - name: domain
          in: query
          description: Display link (FB link card, YouTube desktop companion).
          schema: { type: string, default: props.co }
        - name: business
          in: query
          description: Google business / YouTube channel / Pinterest advertiser. Falls back to creator.
          schema: { type: string }
        - name: media
          in: query
          description: >
            Media URL(s), https or data:image only. Repeat the param
            (?media=a&media=b) OR pipe-separate one value (media=a|b|c) for a
            carousel — never comma-separate. For video, the first URL is the file.
          style: form
          explode: true
          schema:
            type: array
            items: { type: string, format: uri }
        - name: poster
          in: query
          description: Video thumbnail URL.
          schema: { type: string, format: uri }
        - name: likes
          in: query
          schema: { type: string, default: "1.2K" }
        - name: comments
          in: query
          schema: { type: string, default: "84" }
        - name: shares
          in: query
          schema: { type: string, default: "23" }
        - name: views
          in: query
          description: Also the subscriber count on the YouTube desktop placement.
          schema: { type: string, default: "12K" }
        - name: counts
          in: query
          description: Hide engagement numbers and the Facebook feed counts row when false. Accepts 1/0 or true/false.
          schema: { type: boolean, default: true }
        - name: verified
          in: query
          description: Blue check (Facebook / TikTok). Accepts 1/0 or true/false.
          schema: { type: boolean, default: false }
        - name: autoplay
          in: query
          description: 0 shows a tap-to-play overlay instead of autoplaying video (YouTube feed defaults to 0).
          schema: { type: boolean, default: true }
        - name: ratio
          in: query
          description: Media aspect ratio, e.g. 1:1, 4:5, 1.91:1, 16:9. Default is per-platform.
          schema: { type: string }
      responses:
        "200":
          description: Rendered mockup.
          content:
            text/html:
              schema: { type: string }
```

**Events (postMessage).** Beyond the query API, the rendered page speaks a small
`postMessage` protocol to its parent frame — part of the embed contract:

- **Emits** `{ type: "ad-mockup:height", height, version }` on every resize (via
  `ResizeObserver`) so the host can auto-size the iframe.
- **Accepts** `{ type: "ad-mockup:params", params }` — merges `params` (same keys as the
  query params) and re-renders in place with no reload (see Pattern C below).

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
(`Feed` → `feed`, `Stories` → `story`, `Shorts` → `shorts`, `Desktop` → `desktop`); a
placement that isn't valid for the chosen platform falls back to `feed`, so it's always
safe to pass.

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
| `youtube` | 375 × 420 | In-feed card |
| `youtube` shorts | 375 × 667 | Fills whatever height you give it (9:16 look) |
| `youtube` desktop | 560 × 480 | Wider — 16:9 player + title + channel/action rows. Scales to any width |
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
