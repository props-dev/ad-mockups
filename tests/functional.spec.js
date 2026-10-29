const { test, expect } = require("@playwright/test");

const PAGE = "/v1/ad-mockup.html";
/* 1x1 png data URIs — keep tests fully offline/deterministic */
const PX_RED =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PX_BLUE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const LONG_COPY =
  "Okay so I have to be honest about this one because I get asked constantly. " +
  "I have tested probably a dozen of these over the past year and most of them are " +
  "exactly what you would expect: fine, forgettable, not worth the money at all.";

test.describe("contract: defaults and fallbacks", () => {
  test("no params renders a facebook feed card with defaults", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator(".fb")).toBeVisible();
    await expect(page.locator(".fb-name")).toContainText("Creator Name");
    await expect(page.locator(".fb-sub")).toContainText("Sponsored");
    await expect(page.locator(".fb-cta")).toHaveText("Learn More");
    await expect(page.locator(".ph")).toBeVisible(); // placeholder media
  });

  test("unknown platform falls back to facebook", async ({ page }) => {
    await page.goto(PAGE + "?platform=myspace");
    await expect(page.locator(".fb")).toBeVisible();
  });

  test("blank param values are ignored in favor of defaults", async ({ page }) => {
    await page.goto(PAGE + "?creator=&cta=&headline=");
    await expect(page.locator(".fb-name")).toContainText("Creator Name");
    await expect(page.locator(".fb-cta")).toHaveText("Learn More");
  });
});

test.describe("contract: param precedence", () => {
  test("query string overrides inline AD_MOCKUP_PARAMS, which overrides defaults", async ({ page }) => {
    // Swallow the page's own `window.AD_MOCKUP_PARAMS = {...}` assignment so the
    // inline layer is under test control.
    await page.addInitScript(() => {
      Object.defineProperty(window, "AD_MOCKUP_PARAMS", {
        get() { return { creator: "InlineLoses", headline: "Inline Headline" }; },
        set() {},
      });
    });
    await page.goto(PAGE + "?creator=QueryWins");
    await expect(page.locator(".fb-name")).toContainText("QueryWins");
    await expect(page.locator(".fb-headline")).toContainText("Inline Headline");
  });

  test("postMessage param updates re-render without a reload", async ({ page }) => {
    await page.goto(PAGE);
    await page.evaluate(() => {
      window.postMessage({ type: "ad-mockup:params", params: { creator: "Live Update" } }, "*");
    });
    await expect(page.locator(".fb-name")).toContainText("Live Update");
  });

  test("postMessage applies counts and byline after a bare page load", async ({ page }) => {
    await page.goto(PAGE);
    await page.evaluate(() => {
      window.postMessage({ type: "ad-mockup:params", params: {
        platform: "tiktok", creator: "Joanie Sprague", handle: "unverified.handle",
        counts: "0", byline: "name"
      } }, "*");
    });
    await expect(page.locator(".tt-handle")).toHaveText("Joanie Sprague");
    await expect(page.locator(".tt-rail-count")).toHaveCount(0);
    await expect(page.locator(".tt-rail-item svg")).toHaveCount(4);
  });
});

test.describe("security", () => {
  test("html in text params is escaped, never executed", async ({ page }) => {
    const payload = '<img src=x onerror="window.__pwned=1">';
    await page.goto(PAGE + "?creator=" + encodeURIComponent(payload) +
      "&copy=" + encodeURIComponent(payload));
    await expect(page.locator(".fb-name")).toContainText("<img");
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    // the payload must not have created a real element
    expect(await page.locator(".fb-copy img").count()).toBe(0);
  });

  test("protocol-relative media URLs normalize to https", async ({ page }) => {
    await page.goto(PAGE + "?media=" + encodeURIComponent("//example.com/pic.jpg"));
    await expect(page.locator(".media-shell img.media-el"))
      .toHaveAttribute("src", "https://example.com/pic.jpg");
  });

  test("non-https media URLs are rejected (placeholder mode)", async ({ page }) => {
    await page.goto(PAGE + "?media=" + encodeURIComponent("javascript:alert(1)"));
    expect(await page.locator(".media-shell img.media-el").count()).toBe(0);
    await expect(page.locator(".ph")).toBeVisible();
  });
});

test.describe("formats", () => {
  test("carousel: repeated media params → dots, counter, arrows advance", async ({ page }) => {
    await page.goto(PAGE + "?format=carousel" +
      "&media=" + encodeURIComponent(PX_RED) +
      "&media=" + encodeURIComponent(PX_BLUE) +
      "&media=" + encodeURIComponent(PX_RED));
    await expect(page.locator(".car-dots .dot")).toHaveCount(3);
    await expect(page.locator(".js-car-counter")).toHaveText("1/3");
    await page.locator(".js-car-next").click();
    await expect(page.locator(".js-car-counter")).toHaveText("2/3");
    await expect(page.locator(".car-dots .dot").nth(1)).toHaveClass(/active/);
  });

  test("carousel: pipe-separated URLs in ONE media param split correctly", async ({ page }) => {
    await page.goto(PAGE + "?format=carousel&media=" +
      encodeURIComponent(PX_RED + "|" + PX_BLUE));
    await expect(page.locator(".car-dots .dot")).toHaveCount(2);
  });

  test("carousel with a single item degrades to a plain image", async ({ page }) => {
    await page.goto(PAGE + "?format=carousel&media=" + encodeURIComponent(PX_RED));
    expect(await page.locator(".car-dots").count()).toBe(0);
    await expect(page.locator(".media-shell img.media-el")).toBeVisible();
  });

  test("video without a source shows a play overlay over the placeholder", async ({ page }) => {
    await page.goto(PAGE + "?format=video");
    await expect(page.locator(".play-overlay")).toBeVisible();
    await expect(page.locator(".ph")).toBeVisible();
  });
});

test.describe("platform renderers", () => {
  test("facebook: long copy truncates at ~125 chars and See more expands", async ({ page }) => {
    await page.goto(PAGE + "?copy=" + encodeURIComponent(LONG_COPY));
    const seeMore = page.locator(".fb-copy .js-see-more");
    await expect(seeMore).toBeVisible();
    // innerText (not textContent) — the truncated tail is in the DOM but hidden
    const collapsed = await page.locator(".fb-copy").innerText();
    expect(collapsed).not.toContain("worth the money");
    expect(collapsed).toContain("See more");
    await seeMore.click();
    await expect
      .poll(() => page.locator(".fb-copy").innerText())
      .toContain("worth the money at all.");
    expect(await page.locator(".fb-copy .js-see-more").count()).toBe(0);
  });

  test("facebook story: full-bleed story with progress bar, Sponsored header, CTA pill", async ({ page }) => {
    await page.goto(PAGE + "?placement=story&creator=Jess%20Rivera");
    await expect(page.locator(".fbs")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/theme-dark/);
    await expect(page.locator(".fbs-progress .seg")).toHaveCount(1);
    await expect(page.locator(".fbs-name")).toContainText("Jess Rivera");
    await expect(page.locator(".fbs-sub")).toHaveText("Sponsored");
    await expect(page.locator(".fbs-cta")).toHaveText("Learn More");
    // feed chrome must not leak into the story
    expect(await page.locator(".fb-linkcard").count()).toBe(0);
  });

  test("facebook story: overlaid copy hard-clamps with an ellipsis (no See more)", async ({ page }) => {
    await page.goto(PAGE + "?placement=story&copy=" + encodeURIComponent(LONG_COPY));
    await expect(page.locator(".fbs-copy")).toContainText("…");
    expect(await page.locator(".fbs-copy").innerText()).not.toContain("worth the money");
    expect(await page.locator(".fbs-copy .js-see-more").count()).toBe(0);
    // short copy gets no ellipsis
    await page.goto(PAGE + "?placement=story&copy=Short%20copy");
    expect(await page.locator(".fbs-copy").innerText()).toBe("Short copy");
  });

  test("facebook story carousel: progress segments fill cumulatively on advance", async ({ page }) => {
    await page.goto(PAGE + "?placement=story&format=carousel" +
      "&media=" + encodeURIComponent(PX_RED) +
      "&media=" + encodeURIComponent(PX_BLUE) +
      "&media=" + encodeURIComponent(PX_RED));
    const dots = page.locator(".fbs .car-dots .dot");
    await expect(dots).toHaveCount(3);
    // the numeric counter is hidden in story mode (progress bar replaces it)
    await expect(page.locator(".fbs .car-counter")).toBeHidden();
    await page.locator(".js-car-next").click();
    // every segment up to the current card stays lit, unlike feed carousel dots
    await expect(dots.nth(0)).toHaveClass(/active/);
    await expect(dots.nth(1)).toHaveClass(/active/);
    await expect(dots.nth(2)).not.toHaveClass(/active/);
  });

  test("feed carousel dots stay single-active (not cumulative)", async ({ page }) => {
    await page.goto(PAGE + "?format=carousel" +
      "&media=" + encodeURIComponent(PX_RED) +
      "&media=" + encodeURIComponent(PX_BLUE));
    await page.locator(".js-car-next").click();
    await expect(page.locator(".car-dots .dot").nth(1)).toHaveClass(/active/);
    await expect(page.locator(".car-dots .dot").nth(0)).not.toHaveClass(/active/);
  });

  test("placement defaults to feed and unknown values fall back to feed", async ({ page }) => {
    await page.goto(PAGE + "?placement=bogus");
    await expect(page.locator(".fb")).toBeVisible();
    expect(await page.locator(".fbs").count()).toBe(0);
  });

  test("tiktok: dark theme, derived @handle, sponsored label, CTA banner", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok&creator=" + encodeURIComponent("Jess Rivera"));
    await expect(page.locator("body")).toHaveClass(/theme-dark/);
    await expect(page.locator(".tt-handle")).toContainText("@jessrivera");
    await expect(page.locator(".tt-rail-count")).toHaveText(["1.2K", "84", "12K", "23"]);
    await expect(page.locator(".tt-sponsored")).toContainText("Sponsored");
    await expect(page.locator(".tt-cta")).toContainText("Shop now");
  });

  test("tiktok: counts=0 hides numbers and keeps the action rail", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok&counts=0");
    await expect(page.locator(".tt-rail-count")).toHaveCount(0);
    await expect(page.locator(".tt-rail-item")).toHaveCount(4);
    await expect(page.locator(".tt-rail-item svg")).toHaveCount(4);
    await expect(page.locator(".tt-rail-avatar .avatar")).toBeVisible();
    await expect(page.locator(".tt-follow")).toBeVisible();
    await expect(page.locator(".tt-disc")).toBeVisible();
  });

  test("facebook: counts=0 hides the feed counts row but keeps actions", async ({ page }) => {
    await page.goto(PAGE + "?counts=0");
    await expect(page.locator(".fb-counts")).toHaveCount(0);
    await expect(page.locator(".fb-action")).toHaveCount(3);
  });

  test("tiktok: byline=name shows creator without @ even with an explicit handle", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok&creator=" + encodeURIComponent("Joanie Sprague") +
      "&handle=known.handle&byline=name");
    await expect(page.locator(".tt-handle")).toHaveText("Joanie Sprague");
    await expect(page.locator(".tt-rail-count")).toHaveCount(4);
  });

  test("tiktok: invalid byline falls back to @handle", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok&creator=Joanie%20Sprague&byline=other");
    await expect(page.locator(".tt-handle")).toHaveText("@joaniesprague");
  });

  test("tiktok: nav is off by default", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok");
    await expect(page.locator(".tt-nav")).toHaveCount(0);
    await expect(page.locator(".tt-screen")).toHaveCount(0);
  });

  test("tiktok: nav=1 adds the tab bar below the screen and keeps the whole ad in view", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 623 });
    await page.goto(PAGE + "?platform=tiktok&nav=1&cta=Learn%20more");
    await expect(page.locator(".tt-nav-item")).toHaveText(["Home", "Friends", "", "Inbox", "Profile"]);
    const screen = await page.locator(".tt-screen").boundingBox();
    const nav = await page.locator(".tt-nav").boundingBox();
    const top = await page.locator(".tt-topnav").boundingBox();
    const cta = await page.locator(".tt-cta").boundingBox();
    expect(Math.round(screen.height)).toBe(569);
    expect(Math.round(nav.y)).toBe(569);
    expect(Math.round(nav.y + nav.height)).toBe(623);
    expect(top.y).toBeGreaterThanOrEqual(0);
    expect(cta.y + cta.height).toBeLessThanOrEqual(screen.y + screen.height);
  });

  test("google: description row hidden when empty, shown when set", async ({ page }) => {
    await page.goto(PAGE + "?platform=google");
    expect(await page.locator(".gg-desc").count()).toBe(0);
    await page.goto(PAGE + "?platform=google&description=Free%20shipping");
    await expect(page.locator(".gg-desc")).toHaveText("Free shipping");
  });

  test("youtube: video format defaults to tap-to-play (no autoplay)", async ({ page }) => {
    await page.goto(PAGE + "?platform=youtube&format=video&poster=" + encodeURIComponent(PX_RED));
    await expect(page.locator(".play-overlay")).toBeVisible();
    await expect(page.locator(".yt-ad-badge")).toHaveText("Ad");
  });

  test("youtube shorts: full-bleed 9:16 with action rail, Sponsored, CTA", async ({ page }) => {
    await page.goto(PAGE + "?platform=youtube&placement=shorts&business=Acme%20Skin%20Co.&cta=Shop%20now");
    await expect(page.locator(".yts")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/theme-dark/);
    await expect(page.locator(".yts-chan-name")).toContainText("Acme Skin Co.");
    await expect(page.locator(".yts-sponsored")).toContainText("Sponsored");
    await expect(page.locator(".yts-cta")).toContainText("Shop now");
    // in-feed youtube chrome must not leak in
    expect(await page.locator(".yt-ad-badge").count()).toBe(0);
  });

  test("youtube shorts: counts=0 hides numbers and keeps rail icons and text actions", async ({ page }) => {
    await page.goto(PAGE + "?platform=youtube&placement=shorts&counts=0");
    await expect(page.locator(".yts-rail-count")).toHaveText(["Dislike", "Share"]);
    await expect(page.locator(".yts-rail-item")).toHaveCount(4);
    await expect(page.locator(".yts-rail-item svg")).toHaveCount(4);
  });

  test("youtube desktop: watch-page in-stream ad chrome (Ad chip, Skip, companion CTA, light theme)", async ({ page }) => {
    await page.goto(PAGE + "?platform=youtube&placement=desktop&business=Acme%20Skin%20Co." +
      "&headline=The%2030-day%20results&cta=Visit%20site&domain=shop.acme.com&views=74.1K");
    await expect(page.locator(".ytd")).toBeVisible();
    // desktop stays light (only shorts goes dark)
    expect(await page.locator("body.theme-dark").count()).toBe(0);
    await expect(page.locator(".ytd-adchip")).toHaveText("Ad");
    await expect(page.locator(".ytd-skip")).toContainText("Skip");
    await expect(page.locator(".ytd-companion-cta")).toHaveText("Visit site");
    await expect(page.locator(".ytd-companion-sub")).toHaveText("shop.acme.com");
    await expect(page.locator(".ytd-title")).toContainText("The 30-day results");
    await expect(page.locator(".ytd-subscribe")).toHaveText("Subscribe");
    await expect(page.locator(".ytd-chan-subs")).toContainText("74.1K subscribers");
  });

  test("youtube desktop: counts=0 hides like count and subscribers line", async ({ page }) => {
    await page.goto(PAGE + "?platform=youtube&placement=desktop&counts=0");
    await expect(page.locator(".ytd-like-count")).toHaveCount(0);
    await expect(page.locator(".ytd-chan-subs")).toHaveCount(0);
    await expect(page.locator(".ytd-like svg")).toHaveCount(2);
    await expect(page.locator(".ytd-subscribe")).toBeVisible();
  });

  /* the real-duration path (badge/clock/scrubber fed by <video> metadata) needs
     a network-served https video, so it can't run in this zero-network suite —
     these pin the fallbacks that keep placeholder mode deterministic */
  test("youtube: duration chrome falls back safely without a real video", async ({ page }) => {
    // in-feed video with no source: badge exists but stays hidden (no made-up number)
    await page.goto(PAGE + "?platform=youtube&format=video");
    const badge = page.locator(".js-yt-duration");
    expect(await badge.count()).toBe(1);
    await expect(badge).toBeHidden();
    // in-feed image keeps the static 0:30 stand-in
    await page.goto(PAGE + "?platform=youtube&format=image");
    await expect(page.locator(".yt-duration")).toHaveText("0:30");
    // desktop keeps the static clock and part-filled scrubber
    await page.goto(PAGE + "?platform=youtube&placement=desktop&format=video");
    await expect(page.locator(".js-ytd-time")).toHaveText("0:08 / 0:30");
    const fill = await page.locator(".js-ytd-fill").evaluate(el => getComputedStyle(el).width);
    expect(parseFloat(fill)).toBeGreaterThan(0);
  });

  test("youtube placement defaults to feed; unknown/cross-platform values fall back", async ({ page }) => {
    // youtube with no placement → in-feed card
    await page.goto(PAGE + "?platform=youtube");
    await expect(page.locator(".yt")).toBeVisible();
    // a facebook-only placement on youtube falls back to feed
    await page.goto(PAGE + "?platform=youtube&placement=story");
    await expect(page.locator(".yt")).toBeVisible();
    expect(await page.locator(".yts, .ytd, .fbs").count()).toBe(0);
    // a youtube-only placement on facebook falls back to feed
    await page.goto(PAGE + "?platform=facebook&placement=shorts");
    await expect(page.locator(".fb")).toBeVisible();
    expect(await page.locator(".yts").count()).toBe(0);
  });

  test("facebook reels: dark full-bleed with rail counts, Follow, CTA that turns blue", async ({ page }) => {
    await page.goto(PAGE + "?platform=facebook&placement=reels&format=video&creator=Jess%20Rivera");
    await expect(page.locator("body")).toHaveClass(/theme-dark/);
    await expect(page.locator(".vx.fbr")).toBeVisible();
    await expect(page.locator(".vx-title")).toHaveText("Reels");
    await expect(page.locator(".vx-rail-count")).toHaveText(["1.2K", "84", "23"]);
    await expect(page.locator(".vx-name")).toContainText("Jess Rivera");
    await expect(page.locator(".vx-follow")).toHaveText("Follow");
    await expect(page.locator(".vx-cta")).not.toHaveClass(/(^|\s)hot(\s|$)/);
    await expect(page.locator(".vx-cta")).toHaveClass(/(^|\s)hot(\s|$)/, { timeout: 3000 });
  });

  test("facebook instream: 16:9 player with Ad chip and attachment row, light theme", async ({ page }) => {
    await page.goto(PAGE + "?platform=facebook&placement=instream&format=video" +
      "&creator=Acme&headline=Try%20it%20free&domain=acme.com&cta=Shop%20Now");
    await expect(page.locator("body")).not.toHaveClass(/theme-dark/);
    const box = await page.locator(".fbi-player .media-shell").boundingBox();
    expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.02);
    await expect(page.locator(".fbi-adchip")).toContainText("Ad");
    await expect(page.locator(".fbi-name")).toContainText("Acme");
    await expect(page.locator(".fbi-headline")).toHaveText("Try it free");
    await expect(page.locator(".fbi-sub")).toHaveText("acme.com");
    await expect(page.locator(".fbi-cta")).toHaveText("Shop Now");
  });

  test("facebook marketplace: sponsored tile first, three skeleton listings", async ({ page }) => {
    await page.goto(PAGE + "?platform=facebook&placement=marketplace&creator=Acme&headline=Spring%20sale");
    await expect(page.locator(".fbm-title")).toHaveText("Marketplace");
    await expect(page.locator(".fbm-tile")).toHaveCount(4);
    await expect(page.locator(".fbm-headline")).toHaveText("Spring sale");
    await expect(page.locator(".fbm-by")).toContainText("Sponsored · Acme");
    await expect(page.locator(".fbm-skel")).toHaveCount(3);
  });

  test("instagram feed: username header, CTA strip, likes, caption, comments", async ({ page }) => {
    await page.goto(PAGE + "?platform=instagram&creator=Jess%20Rivera&handle=jess.reviews");
    await expect(page.locator("body")).not.toHaveClass(/theme-dark/);
    await expect(page.locator(".ig-name")).toContainText("jess.reviews");
    await expect(page.locator(".ig-sponsored")).toHaveText("Sponsored");
    await expect(page.locator(".ig-cta")).toContainText("Learn more");
    await expect(page.locator(".ig-actions svg")).toHaveCount(4);
    await expect(page.locator(".ig-likes")).toHaveText("1.2K likes");
    await expect(page.locator(".ig-caption b")).toHaveText("jess.reviews");
    await expect(page.locator(".ig-comments")).toHaveText("View all 84 comments");
    await expect(page.locator(".ig-cta")).toHaveClass(/(^|\s)hot(\s|$)/, { timeout: 3000 });
  });

  test("instagram feed: zero likes and comments drop their rows; byline=name shows the creator", async ({ page }) => {
    await page.goto(PAGE + "?platform=instagram&creator=Jess%20Rivera&handle=jess.reviews&likes=0&comments=0&byline=name");
    await expect(page.locator(".ig-likes")).toHaveCount(0);
    await expect(page.locator(".ig-comments")).toHaveText("");
    await expect(page.locator(".ig-name")).toContainText("Jess Rivera");
  });

  test("instagram reels and story: dark theme with username and CTA", async ({ page }) => {
    await page.goto(PAGE + "?platform=instagram&placement=reels&format=video&handle=jess.reviews");
    await expect(page.locator("body")).toHaveClass(/theme-dark/);
    await expect(page.locator(".vx.igr")).toBeVisible();
    await expect(page.locator(".vx-rail-count")).toHaveText(["1.2K", "84", "23"]);
    await expect(page.locator(".vx-music")).toContainText("jess.reviews · Original audio");
    await page.goto(PAGE + "?platform=instagram&placement=story&handle=jess.reviews&cta=Shop%20now");
    await expect(page.locator("body")).toHaveClass(/theme-dark/);
    await expect(page.locator(".igs-header .vx-name")).toContainText("jess.reviews");
    await expect(page.locator(".igs-cta")).toContainText("Shop now");
  });

  test("meta placements fall back to feed on other platforms", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok&placement=reels");
    await expect(page.locator(".tt")).toBeVisible();
    expect(await page.locator(".vx").count()).toBe(0);
    await page.goto(PAGE + "?platform=instagram&placement=marketplace");
    await expect(page.locator(".ig")).toBeVisible();
    expect(await page.locator(".fbm").count()).toBe(0);
  });

  test("tiktok: saves fills the bookmark; without it the bookmark keeps showing views", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok&saves=1.1K&views=9K");
    await expect(page.locator(".tt-rail-count")).toHaveText(["1.2K", "84", "1.1K", "23"]);
    await page.goto(PAGE + "?platform=tiktok&views=9K");
    await expect(page.locator(".tt-rail-count")).toHaveText(["1.2K", "84", "9K", "23"]);
  });

  test("omit leaves unknown fields out instead of showing defaults", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok&omit=saves");
    await expect(page.locator(".tt-rail-item")).toHaveCount(4);
    await expect(page.locator(".tt-rail-count")).toHaveText(["1.2K", "84", "23"]);
    await page.goto(PAGE + "?omit=domain|description|shares&description=Free%20shipping");
    await expect(page.locator(".fb-domain")).toHaveCount(0);
    await expect(page.locator(".fb-desc")).toHaveCount(0);
    await expect(page.locator(".fb-counts")).toContainText("84 comments");
    await expect(page.locator(".fb-counts")).not.toContainText("shares");
    await page.goto(PAGE + "?platform=facebook&placement=reels&omit=likes");
    await expect(page.locator(".vx-rail-count")).toHaveText(["84", "23"]);
  });

  test("instagram feed carousel: real media gets dots and counter that advance", async ({ page }) => {
    await page.goto(PAGE + "?platform=instagram&format=carousel&media=" + encodeURIComponent(PX_RED + "|" + PX_BLUE));
    await expect(page.locator(".ig .car-item")).toHaveCount(2);
    await expect(page.locator(".ig .car-counter")).toHaveText("1/2");
    await page.locator(".ig .car-arrow.next").click();
    await expect(page.locator(".ig .car-counter")).toHaveText("2/2");
  });

  test("facebook instream: Ad chip counts down the video's real remaining time", async ({ page }) => {
    await page.route((url) => url.hostname === "cdn.example.com", (route) => route.abort());
    await page.goto(PAGE + "?platform=facebook&placement=instream&format=video&media=" +
      encodeURIComponent("https://cdn.example.com/ad.mp4"));
    await expect(page.locator(".js-fbi-left")).toHaveText("0:15");
    await page.evaluate(() => {
      const video = document.querySelector(".fbi .js-video");
      Object.defineProperty(video, "duration", { value: 30 });
      Object.defineProperty(video, "currentTime", { value: 10 });
      video.dispatchEvent(new Event("timeupdate"));
    });
    await expect(page.locator(".js-fbi-left")).toHaveText("0:20");
    const width = await page.locator(".js-fbi-fill").evaluate((el) => el.style.width);
    expect(width).toBe("33.33%");
  });

  test("reels: an expanded long caption scrolls and keeps the account row on screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const copy = encodeURIComponent(LONG_COPY.repeat(12));
    for (const platform of ["facebook", "instagram"]) {
      await page.goto(PAGE + `?platform=${platform}&placement=reels&copy=${copy}`);
      await page.locator(".vx-copy .js-see-more").click();
      const id = await page.locator(".vx-id").boundingBox();
      expect(id.y).toBeGreaterThanOrEqual(0);
      const copyBox = await page.locator(".vx-copy").boundingBox();
      expect(copyBox.height).toBeLessThanOrEqual(667 * 0.38 + 1);
    }
  });

  test("omit also applies to Google and YouTube fields", async ({ page }) => {
    await page.goto(PAGE + "?platform=google&description=DETAIL&omit=description");
    await expect(page.locator(".gg-desc")).toHaveCount(0);
    await page.goto(PAGE + "?platform=youtube&description=DETAIL&omit=description");
    await expect(page.locator(".yt-desc")).toHaveCount(0);
    await page.goto(PAGE + "?platform=youtube&placement=shorts&omit=likes");
    await expect(page.locator(".yts-rail-count")).toHaveText(["Dislike", "84", "Share"]);
    await page.goto(PAGE + "?platform=youtube&placement=desktop&omit=domain,likes");
    await expect(page.locator(".ytd-companion-sub")).toHaveCount(0);
    await expect(page.locator(".ytd-like-count")).toHaveCount(0);
  });

  test("pinterest: Save button and business falls back to creator", async ({ page }) => {
    await page.goto(PAGE + "?platform=pinterest&creator=Jess");
    await expect(page.locator(".pin-save")).toHaveText("Save");
    await expect(page.locator(".pin-promoted-text")).toContainText("Promoted by Jess");
  });
});

test.describe("observability", () => {
  test("version is stamped in meta tag, console, and height postMessage", async ({ page }) => {
    const logs = [];
    page.on("console", (msg) => logs.push(msg.text()));
    await page.goto(PAGE);
    const metaVersion = await page
      .locator('meta[name="ad-mockup-version"]')
      .getAttribute("content");
    expect(metaVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(logs.some((l) => l.includes("[ad-mockup] v" + metaVersion))).toBe(true);
    const msg = await page.evaluate(
      () => new Promise((resolve) => {
        window.addEventListener("message", (e) => {
          if (e.data && e.data.type === "ad-mockup:height") resolve(e.data);
        });
        // grow the body so the ResizeObserver fires a fresh height message
        document.body.style.minHeight = "900px";
      })
    );
    expect(msg.version).toBe(metaVersion);
    expect(msg.height).toBeGreaterThan(0);
  });
});
