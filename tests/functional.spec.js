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
    await expect(page.locator(".tt-nav-item")).toHaveText(["Home", "Friends", "", "Inbox", "Me"]);
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

  /* TikTok's own ad preview (TikTok Ads Manager) is the reference for the layout */
  const TT_THREE = encodeURIComponent(PX_RED + "|" + PX_BLUE + "|" + PX_RED);
  test("tiktok: matches TikTok's preview chrome: no LIVE, no audio line, slim red CTA", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok&cta=Sign%20Up");
    await expect(page.locator(".tt")).not.toContainText("LIVE");
    await expect(page.locator(".tt")).not.toContainText("Original audio");
    await expect(page.locator(".tt-sponsored")).toHaveText("Sponsored");
    const cta = page.locator(".tt-cta");
    await expect(cta).toHaveText("Sign Up");
    expect(await cta.locator("svg").count()).toBe(0);
    // red from the first frame, text centered
    expect(await cta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(254, 44, 85)");
    expect(await cta.evaluate((el) => getComputedStyle(el).justifyContent)).toBe("center");
  });

  test("tiktok: statusbar is off by default; statusbar=1 puts 9:41 above the tabs", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok");
    await expect(page.locator(".tt-status")).toHaveCount(0);
    await page.goto(PAGE + "?platform=tiktok&statusbar=1");
    await expect(page.locator(".tt-status")).toContainText("9:41");
    const status = await page.locator(".tt-status").boundingBox();
    const tabs = await page.locator(".tt-topnav").boundingBox();
    expect(status.y).toBe(0);
    expect(tabs.y).toBeGreaterThanOrEqual(status.y + status.height);
  });

  test("tiktok: photo posts show a Photo badge beside the name; video does not", async ({ page }) => {
    for (const format of ["image", "carousel"]) {
      await page.goto(PAGE + "?platform=tiktok&byline=name&creator=Uyen&format=" + format + "&media=" + TT_THREE);
      await expect(page.locator(".tt-photo")).toHaveText("Photo");
      await expect(page.locator(".tt-handle")).toHaveText("Uyen");
    }
    await page.goto(PAGE + "?platform=tiktok&format=video");
    await expect(page.locator(".tt-photo")).toHaveCount(0);
  });

  test("tiktok: a long name ends in an ellipsis and keeps the Photo badge in view", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 569 });
    await page.goto(PAGE + "?platform=tiktok&byline=name&verified=1&creator=" +
      encodeURIComponent("Automobile Club of Southern California Enterprises"));
    const s = await page.evaluate(() => {
      const name = document.querySelector(".tt-name"), stack = document.querySelector(".tt-bottom");
      const right = parseFloat(getComputedStyle(stack).paddingRight);
      const edge = stack.getBoundingClientRect().right - right;
      return {
        truncated: name.scrollWidth > name.clientWidth,
        ellipsis: getComputedStyle(name).textOverflow,
        photoInside: document.querySelector(".tt-photo").getBoundingClientRect().right <= edge + 0.5,
        checkInside: document.querySelector(".tt-handle .verified").getBoundingClientRect().right <= edge + 0.5,
      };
    });
    expect(s).toEqual({ truncated: true, ellipsis: "ellipsis", photoInside: true, checkInside: true });
  });

  test("tiktok: sizes scale with the frame width", async ({ page }) => {
    const sizes = async (width) => {
      await page.setViewportSize({ width, height: Math.round(width * 16 / 9) });
      await page.goto(PAGE + "?platform=tiktok");
      return page.evaluate(() => {
        const w = (sel) => document.querySelector(sel).getBoundingClientRect().width;
        return { avatar: w(".tt-rail-avatar .avatar"), icon: w(".tt-rail-item svg"), cta: w(".tt-cta") };
      });
    };
    const small = await sizes(320), large = await sizes(406);
    for (const k of ["avatar", "icon", "cta"]) {
      expect(large[k] / small[k]).toBeCloseTo(406 / 320, 1);
    }
    // TikTok's proportions: avatar ~11.8% and CTA ~71% of the phone width
    expect(small.avatar / 320).toBeCloseTo(0.118, 2);
    expect(small.cta / 320).toBeCloseTo(0.708, 2);
  });

  test("tiktok: the caption scrim spans the width and does not block the rail", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 569 });
    await page.goto(PAGE + "?platform=tiktok");
    const bottom = await page.locator(".tt-bottom").boundingBox();
    expect(Math.round(bottom.width)).toBe(320);
    const hit = await page.evaluate(() => {
      const d = document.querySelector(".tt-disc").getBoundingClientRect();
      return document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2).closest(".tt-disc") !== null;
    });
    expect(hit).toBe(true);
  });

  test("tiktok carousel: dots sit just above the name, no counter, and follow See more", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 569 });
    await page.goto(PAGE + "?platform=tiktok&format=carousel&media=" + TT_THREE +
      "&copy=" + encodeURIComponent(LONG_COPY + " " + LONG_COPY));
    await expect(page.locator(".js-car-counter")).toBeHidden();
    const gap = () => page.evaluate(() => {
      const dots = document.querySelector(".js-car-dots").getBoundingClientRect();
      return document.querySelector(".tt-byline").getBoundingClientRect().top - dots.bottom;
    });
    const before = await gap();
    expect(before).toBeGreaterThanOrEqual(2);
    expect(before).toBeLessThanOrEqual(14);
    await page.locator(".js-see-more").click();
    await expect.poll(gap).toBeCloseTo(before, 0);
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
    await expect(page.locator(".yt-ad-badge")).toHaveText("Ad", { useInnerText: true });
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
    await expect(page.locator(".ytd-adchip")).toHaveText("Ad", { useInnerText: true });
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
    // no invented length: the chip reads "Ad" and the bar is empty until metadata loads
    await expect(page.locator(".js-fbi-time")).toBeHidden();
    await expect(page.locator(".fbi-adchip")).toHaveText("Ad", { useInnerText: true });
    expect(await page.locator(".js-fbi-fill").evaluate((el) => getComputedStyle(el).width)).toBe("0px");
    await page.evaluate(() => {
      const video = document.querySelector(".fbi .js-video");
      Object.defineProperty(video, "duration", { value: 30 });
      Object.defineProperty(video, "currentTime", { value: 10 });
      video.dispatchEvent(new Event("timeupdate"));
    });
    await expect(page.locator(".js-fbi-time")).toBeVisible();
    await expect(page.locator(".fbi-adchip")).toHaveText("Ad · 0:20", { useInnerText: true });
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

test.describe("carousel arrows are clickable on every template", () => {
  const THREE = encodeURIComponent(PX_RED + "|" + PX_BLUE + "|" + PX_RED);
  const LONG_COUNTS = "&likes=1,234,567,890&comments=987,654,321&shares=123,456,789&saves=55,555,555&views=9,876,543";
  /* README "Suggested iframe sizes"; full-screen templates also at the 320 x 569
     frame the Media Auditor embeds them in. */
  const TALL = [{ width: 375, height: 667 }, { width: 320, height: 569 }];
  const CASES = [
    ["facebook", "feed", [{ width: 375, height: 660 }]],
    ["facebook", "story", TALL],
    ["facebook", "reels", TALL, true],
    ["facebook", "instream", [{ width: 375, height: 440 }]],
    ["facebook", "marketplace", [{ width: 375, height: 640 }]],
    ["instagram", "feed", [{ width: 375, height: 700 }]],
    ["instagram", "reels", TALL, true],
    ["instagram", "story", TALL],
    ["tiktok", "", TALL, true],
    ["youtube", "feed", [{ width: 375, height: 420 }]],
    ["youtube", "shorts", TALL, true],
    ["youtube", "desktop", [{ width: 560, height: 480 }]],
    ["google", "", [{ width: 375, height: 440 }]],
    ["pinterest", "", [{ width: 375, height: 700 }]],
  ];
  const arrowState = () => {
    const car = document.querySelector(".js-carousel").getBoundingClientRect();
    const box = (sel) => document.querySelector(sel).getBoundingClientRect();
    const clear = (sel) => {
      const b = document.querySelector(sel), r = b.getBoundingClientRect();
      return b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    };
    const rail = document.querySelector(".tt-rail, .vx-rail, .yts-rail");
    return {
      prevClear: clear(".js-car-prev"), nextClear: clear(".js-car-next"),
      prevInset: Math.round(box(".js-car-prev").left - car.left),
      nextInset: Math.round(car.right - box(".js-car-next").right),
      gapToRail: rail ? Math.round(rail.getBoundingClientRect().left - box(".js-car-next").right) : null,
      besideRail: rail ? (() => {
        const r = rail.getBoundingClientRect(), n = box(".js-car-next");
        return n.bottom > r.top && n.top < r.bottom;
      })() : false,
    };
  };
  for (const [platform, placement, sizes, hasRail] of CASES) {
    const label = platform + (placement ? " " + placement : "");
    const base = PAGE + "?platform=" + platform + (placement ? "&placement=" + placement : "") + "&format=carousel&media=" + THREE;
    for (const size of sizes) {
      test(`${label} at ${size.width}x${size.height}: nothing covers either arrow`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto(base);
        await expect(page.locator(".js-carousel")).toHaveCount(1);
        const s = await page.evaluate(arrowState);
        expect(s.prevClear && s.nextClear).toBe(true);
        if (s.besideRail) expect(s.gapToRail).toBeGreaterThanOrEqual(8);
        // no rail at the arrow's height: Next keeps the inset that mirrors Prev
        else expect(s.nextInset).toBe(s.prevInset);
      });
      if (hasRail) {
        test(`${label} at ${size.width}x${size.height}: long counts widen the rail, Next stays clear`, async ({ page }) => {
          await page.setViewportSize(size);
          await page.goto(base + LONG_COUNTS);
          const s = await page.evaluate(arrowState);
          expect(s.nextClear).toBe(true);
          expect(s.gapToRail).toBeGreaterThanOrEqual(8);
        });
      }
    }
  }

  for (const size of TALL) {
    test(`facebook reels at ${size.width}x${size.height}, counts=0 with the caption expanded: both arrows stay clickable`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(PAGE + "?platform=facebook&placement=reels&counts=0&format=carousel&media=" + THREE +
        "&copy=" + encodeURIComponent(LONG_COPY + " " + LONG_COPY));
      await page.locator(".js-see-more").click();
      const s = await page.evaluate(arrowState);
      expect(s.prevClear && s.nextClear).toBe(true);
      if (s.besideRail) expect(s.gapToRail).toBeGreaterThanOrEqual(8);
      else expect(s.nextInset).toBe(s.prevInset);
    });
  }

  test("tiktok in the auditor frame: Next and Prev advance by click", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 569 });
    await page.goto(PAGE + "?platform=tiktok&format=carousel&media=" + THREE);
    const lit = page.locator(".js-car-dots .dot.active");
    const litIndex = () => lit.evaluate((d) => Array.from(d.parentElement.children).indexOf(d));
    await page.locator(".js-car-next").click({ timeout: 2000 });
    await expect.poll(litIndex).toBe(1);
    await page.locator(".js-car-next").click({ timeout: 2000 });
    await expect.poll(litIndex).toBe(2);
    await page.locator(".js-car-prev").click({ timeout: 2000 });
    await expect.poll(litIndex).toBe(1);
  });

  test("a frame laid out at zero size places Next once it gets a size", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 569 });
    await page.setContent('<iframe id="f" style="display:none;width:320px;height:569px;border:0"></iframe>');
    await page.locator("#f").evaluate((f, src) => { f.src = src; }, "http://127.0.0.1:4173" + PAGE + "?platform=tiktok&format=carousel&media=" + THREE);
    const frame = page.frameLocator("#f");
    await page.waitForTimeout(300);
    await page.locator("#f").evaluate((f) => { f.style.display = "block"; });
    await expect.poll(() => frame.locator("body").evaluate(() => {
      const rail = document.querySelector(".tt-rail").getBoundingClientRect();
      return Math.round(rail.left - document.querySelector(".js-car-next").getBoundingClientRect().right);
    })).toBeGreaterThanOrEqual(8);
  });
});

test.describe("height report fits the content", () => {
  /* Host the renderer the way embeds do: a sandboxed iframe at a guessed height. */
  const reports = async (page, query, frame) => {
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.setContent(
      `<script>window.h = []; addEventListener("message", (e) => {
        if (e.data && e.data.type === "ad-mockup:height") window.h.push(e.data.height); });</script>` +
      `<iframe id="f" sandbox="allow-scripts" style="border:0;width:${frame.width}px;height:${frame.height}px"
        src="http://127.0.0.1:4173${PAGE}?${query}"></iframe>`
    );
    await expect.poll(() => page.evaluate(() => window.h.length)).toBeGreaterThan(0);
    return () => page.evaluate(() => window.h[window.h.length - 1]);
  };
  const contentHeight = (page) => page.frames()[1].evaluate(() =>
    Math.ceil(document.getElementById("root").getBoundingClientRect().height));

  for (const query of ["platform=google", "platform=youtube", "platform=instagram"]) {
    test(`${query} in a taller frame reports its own height, not the frame's`, async ({ page }) => {
      const last = await reports(page, query, { width: 380, height: 620 });
      const content = await contentHeight(page);
      expect(content).toBeLessThan(620);
      await expect.poll(last).toBe(content);
    });
  }

  test("facebook taller than the frame reports its full height", async ({ page }) => {
    const last = await reports(page, "platform=facebook", { width: 380, height: 400 });
    const content = await contentHeight(page);
    expect(content).toBeGreaterThan(400);
    await expect.poll(last).toBe(content);
  });

  test("full-screen tiktok reports the frame height", async ({ page }) => {
    const last = await reports(page, "platform=tiktok", { width: 320, height: 569 });
    await expect.poll(last).toBe(569);
  });

  test("full-screen tiktok in a frame shorter than 9:16 reports the 9:16 height", async ({ page }) => {
    const last = await reports(page, "platform=tiktok", { width: 320, height: 300 });
    await expect.poll(last).toBe(569);
    const withNav = await reports(page, "platform=tiktok&nav=1", { width: 320, height: 300 });
    await expect.poll(withNav).toBe(623);
  });

  test("an auto-sizing host grows back to a phone after a short card", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.setContent(
      `<script>window.h = []; addEventListener("message", (e) => {
        if (!e.data || e.data.type !== "ad-mockup:height") return;
        window.h.push(e.data.height);
        document.getElementById("f").style.height = e.data.height + "px"; });</script>` +
      `<iframe id="f" sandbox="allow-scripts" style="border:0;width:375px;height:667px"
        src="http://127.0.0.1:4173${PAGE}"></iframe>`
    );
    // like the Media Auditor: a constant src, params arrive by postMessage
    await expect.poll(() => page.evaluate(() => window.h.length)).toBeGreaterThan(0);
    const post = (params) => page.locator("#f").evaluate((f, params) =>
      f.contentWindow.postMessage({ type: "ad-mockup:params", params }, "*"), params);
    const frameHeight = () => page.locator("#f").evaluate((f) => f.getBoundingClientRect().height);
    await post({ platform: "google" });
    await expect.poll(frameHeight).toBeLessThan(500);
    await post({ platform: "tiktok" });
    await expect.poll(frameHeight).toBe(667);
  });

  /* A host that applies every report to the frame, as the Media Auditor does,
     must settle on the content height instead of chasing its own resize. */
  const TEMPLATES = [
    "platform=facebook", "platform=facebook&placement=reels", "platform=facebook&placement=instream",
    "platform=facebook&placement=marketplace", "platform=facebook&placement=story",
    "platform=instagram", "platform=instagram&placement=reels", "platform=instagram&placement=story",
    "platform=tiktok", "platform=google", "platform=youtube", "platform=youtube&placement=shorts",
    "platform=youtube&placement=desktop", "platform=pinterest",
  ];
  for (const query of TEMPLATES) {
    for (const format of ["image", "video", "carousel"]) {
      test(`auto-sizing host settles on ${query}&format=${format}`, async ({ page }) => {
        const width = /placement=desktop/.test(query) ? 560 : 380;
        await page.setViewportSize({ width: 900, height: 1000 });
        await page.setContent(
          `<script>window.h = []; addEventListener("message", (e) => {
            if (!e.data || e.data.type !== "ad-mockup:height") return;
            window.h.push(e.data.height);
            document.getElementById("f").style.height = e.data.height + "px"; });</script>` +
          `<iframe id="f" sandbox="allow-scripts" style="border:0;width:${width}px;height:620px"
            src="http://127.0.0.1:4173${PAGE}?${query}&format=${format}"></iframe>`
        );
        // settled: no new report across a 300ms window, polled so a slow runner just waits longer
        await expect.poll(async () => {
          const before = await page.evaluate(() => window.h.length);
          await page.waitForTimeout(300);
          return before > 0 && before === await page.evaluate(() => window.h.length);
        }, { timeout: 10000 }).toBe(true);
        const h = await page.evaluate(() => window.h);
        expect(h.length, `too many reports: ${h.join(",")}`).toBeLessThan(8);
        expect(h[h.length - 1]).toBeGreaterThan(150);
        expect(h[h.length - 1]).toBe(await contentHeight(page));
      });
    }
  }

  test("expanding See more re-reports the taller height", async ({ page }) => {
    const last = await reports(page, "platform=facebook&copy=" + encodeURIComponent(LONG_COPY + " " + LONG_COPY),
      { width: 380, height: 900 });
    const before = await last();
    await page.frameLocator("#f").locator(".js-see-more").click();
    await expect.poll(last).toBeGreaterThan(before);
    await expect.poll(last).toBe(await contentHeight(page));
  });
});
