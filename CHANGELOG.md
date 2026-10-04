# Changelog

Versions track the `VERSION` const in `v1/ad-mockup.html` (mirrored in the
`ad-mockup-version` meta tag). Param changes within `v1/` are additive-only;
breaking changes ship as a new `v2/` directory.

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
