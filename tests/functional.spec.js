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
    await page.goto(PAGE + "?placement=reels");
    await expect(page.locator(".fb")).toBeVisible();
    expect(await page.locator(".fbs").count()).toBe(0);
  });

  test("tiktok: dark theme, derived @handle, sponsored label, CTA banner", async ({ page }) => {
    await page.goto(PAGE + "?platform=tiktok&creator=" + encodeURIComponent("Jess Rivera"));
    await expect(page.locator("body")).toHaveClass(/theme-dark/);
    await expect(page.locator(".tt-handle")).toContainText("@jessrivera");
    await expect(page.locator(".tt-sponsored")).toContainText("Sponsored");
    await expect(page.locator(".tt-cta")).toContainText("Shop now");
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
