# Changelog

Versions track the `VERSION` const in `v1/ad-mockup.html` (mirrored in the
`ad-mockup-version` meta tag). Param changes within `v1/` are additive-only;
breaking changes ship as a new `v2/` directory.

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
