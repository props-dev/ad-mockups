# Changelog

Versions track the `VERSION` const in `v1/ad-mockup.html` (mirrored in the
`ad-mockup-version` meta tag). Param changes within `v1/` are additive-only;
breaking changes ship as a new `v2/` directory.

## 1.7.0 - 2026-10-30

- TikTok in-feed now matches TikTok's own ad preview (Ads Manager) for the
  same ad. Sizes scale with the frame width (CSS container units), so the
  proportions hold at any embed size; the rail, type and icons are about a
  quarter smaller than before.
  - Removed the "LIVE" label and the invented "creator · Original audio" line;
    TikTok's preview shows neither, for photo or video ads.
  - The right rail sits lower, with the music disc level with the CTA.
  - Carousel dots sit just above the name, and the "1/5" counter is gone.
    Long carousels wrap the dots rather than run under the rail.
  - Carousels get TikTok's "Photo" badge beside the name.
  - Caption in smaller type, about three lines (110 characters) before "more".
    An expanded caption scrolls inside 38% of the screen, so the name and
    dots stay below the tabs.
  - "Sponsored" is a small grey tag; the CTA is a slim red button with centered
    text and no chevron, red from the first frame.
  - The caption scrim spans the full width, so it no longer leaves a hard
    edge beside the rail.
  - `nav=1`: the last tab reads "Me". The bar stays 54px tall.
  - A CTA label that wraps grows the button (a single long word breaks
    inside it), and a very long count is cut
    with an ellipsis so the rail cannot cover the CTA.
- Add `statusbar=1` (TikTok): the phone's status bar above the tabs, as in
  TikTok's preview. Off by default.
- Add `photo` (TikTok): `1` shows the "Photo" badge on a single-image photo
  post, `0` hides it. Empty shows it for carousels only, because a single
  image may be a video ad's cover.
- Browsers without CSS container query units (Safari before 16, Chrome before
  105) size the TikTok screen as a 375px phone.
- Engagement counts stay as passed in; TikTok's preview shows sample numbers.

## 1.6.2 - 2026-10-30

- Fix: `ad-mockup:height` reported the page body's height, which is never less
  than the frame's (`html, body { height: 100% }`). A card shorter than its
  frame, such as Google, YouTube feed or Instagram feed, left the frame at its
  first guessed height with blank space below. It now reports the mockup's own
  height and re-reports when the content changes (for example See more) or
  new params arrive by `ad-mockup:params`. Full-screen placements still report
  the frame height, but never less than a 9:16 phone at their width (plus the
  `nav=1` tab bar), so a host that shrank the frame for a short card grows it
  back when a full-screen ad follows. No params change.

## 1.6.1 - 2026-10-30

- Fix: the carousel Next arrow sat under the right-hand action rail on TikTok,
  Facebook and Instagram Reels, and YouTube Shorts, so clicking it did nothing.
  It now sits just left of the rail, measured after each render and on resize,
  so long counts cannot cover it. Where the rail does not reach the arrow
  (`counts=0`), or there is no rail, Next keeps the default inset. Swipe and the Prev arrow were unaffected; no params change.

## 1.6.0 - 2026-10-29

- Add Facebook placements `reels`, `instream` and `marketplace`, and a new
  `instagram` platform with `feed`, `reels` and `story`. Together with the
  existing Facebook feed and story they cover the Meta placements that carry
  most Props spend.
- In-stream reads the creative's real length for its `Ad · m:ss` countdown and
  progress bar; until the video's metadata loads, or for a still image, the chip
  reads just `Ad` and the bar is empty. Neighbouring content (host video, other listings) is drawn as
  neutral skeleton, never invented.
- Add `saves` for the TikTok bookmark count. When it is empty the bookmark
  still shows `views`, so existing URLs render as before.
- Add `omit`: a comma- or pipe-separated list of fields the source does not
  have (`likes`, `comments`, `shares`, `saves`, `domain`, `description`). Each
  is left out of the mockup instead of showing a plausible default. Applies to
  every renderer that draws the field (Facebook, Instagram, TikTok, Google,
  YouTube).
- `byline=name` also applies to the Instagram username.
- Existing placements render identically; all prior visual baselines pass
  unchanged.

## 1.5.0 - 2026-10-04

- Add `counts=0` to hide engagement numbers on TikTok, YouTube Shorts, and
  YouTube desktop, including the desktop subscribers line, and the Facebook feed
  counts row. Icons and actions remain visible.
- Add `byline=name` to show the creator display name without `@` on TikTok,
  even when an explicit handle is supplied. Invalid values use the handle.
- Add `nav=1` to show the TikTok bottom tab bar (Home, Friends, create,
  Inbox, Profile) under the screen. The bar is 54px tall; the video area
  shrinks by that much, so a 9:16 screen needs a frame 54px taller.
- Defaults are unchanged: `counts=1`, `byline=handle` and `nav=0` preserve
  existing URLs.

## 1.3.0 — 2026-07-10

- YouTube duration chrome is now real, read from the `<video>` element's metadata
  (`preload="metadata"` was already set, so no extra download):
  - In-feed video ads gain the bottom-right duration badge (previously omitted for
    video, hardcoded `0:30` for image). It shows the creative's actual length and
    counts down the remaining time while the preview plays, matching real YouTube.
  - Desktop watch-page ads get a live `current / total` clock and a yellow scrubber
    that fills with actual playback progress (previously static `0:08 / 0:30` at 34%).
- Static fallbacks are unchanged when there's no real video: image-format ads keep
  the `0:30` stand-in badge and the desktop mock keeps its static clock/scrubber, and
  a video whose metadata fails to load leaves the in-feed badge hidden rather than
  showing a wrong number. No param changes.

## 1.2.0 — 2026-07-09

- YouTube gains two placements via the existing `placement` param:
  `shorts` (full-bleed 9:16 with like/dislike/comment/share rail, channel row +
  Sponsored + CTA — dark theme) and `desktop` (watch-page in-stream ad: 16:9 player
  with Ad chip, yellow scrubber, Skip button, companion CTA overlay + player controls;
  title, channel row with Subscribe, and Like/Share/Save bar below — light theme).
- `placement` is now validated against a per-platform allow-list (`facebook`:
  feed|story, `youtube`: feed|shorts|desktop). A placement not valid for the chosen
  platform falls back to that platform's default (`feed`) — existing URLs unaffected.
- README: added an OpenAPI 3.1 spec for the renderer plus the postMessage event contract.

## 1.1.0 — 2026-07-08

- New `placement` param (additive): `feed` (default) | `story`. Facebook only for
  now; other platforms ignore it, unknown values fall back to `feed`.
- Facebook Stories ad: full-bleed 9:16, segmented progress bar (carousel cards
  become progress segments and sync on swipe), Sponsored header with menu/close,
  optional overlaid copy, swipe-up chevron + CTA pill. All three formats supported.
- Story progress segments fill cumulatively — every card you've viewed stays lit,
  matching real Stories. Feed carousel dots keep single-active behavior.
- Story copy hard-clamps with an ellipsis (no See-more affordance in a story) and
  sits on a stronger scrim so it stays legible over bright creative.

## 1.0.0 — 2026-07-08

Initial release.

- Platforms: `facebook` (mobile feed), `tiktok` (in-feed), `google` (Demand Gen /
  Discover card), `youtube` (in-feed), `pinterest` (promoted pin).
- Formats: `image`, `video` (muted autoplay, tap-pause, mute toggle, poster
  fallback), `carousel` (scroll-snap swipe, dots, counter, hover arrows).
- Params via URL query string or inline `window.AD_MOCKUP_PARAMS` (query wins);
  placeholder fallbacks for missing media/avatar; `//cdn.bubble.io` URL
  normalization; https-only media; full HTML escaping + CSP.
- `postMessage` integration: emits `ad-mockup:height`, accepts `ad-mockup:params`.
