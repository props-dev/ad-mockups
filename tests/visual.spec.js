/* Visual regression over the full platform × format matrix in placeholder mode
   (no media params → zero network → deterministic pixels; animations are
   disabled by Playwright during screenshots).

   Baselines are OS-specific (font rendering) and live under
   tests/__screenshots__/chromium-<platform>/. Generate/refresh with:
     npm run test:visual:update
   CI runs functional tests only by default — run this suite locally (or in the
   same OS as the committed baselines) before releasing a visual change. */
const { test, expect } = require("@playwright/test");

const PAGE = "/v1/ad-mockup.html";
const PLATFORMS = ["facebook", "tiktok", "google", "youtube", "pinterest"];
const FORMATS = ["image", "video", "carousel"];
const HEIGHTS = { facebook: 700, tiktok: 667, google: 460, youtube: 440, pinterest: 720 };

for (const platform of PLATFORMS) {
  for (const format of FORMATS) {
    test(`${platform} / ${format}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: HEIGHTS[platform] });
      await page.goto(
        `${PAGE}?platform=${platform}&format=${format}` +
          "&creator=Jess%20Rivera&headline=The%2030-day%20results%20speak%20for%20themselves" +
          "&description=Free%20shipping%20on%20your%20first%20order&verified=1"
      );
      await expect(page).toHaveScreenshot(`${platform}-${format}.png`);
    });
  }
}

for (const format of FORMATS) {
  test(`facebook-story / ${format}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(
      `${PAGE}?platform=facebook&placement=story&format=${format}` +
        "&creator=Jess%20Rivera&headline=The%2030-day%20results%20speak%20for%20themselves" +
        "&description=Free%20shipping%20on%20your%20first%20order&verified=1"
    );
    await expect(page).toHaveScreenshot(`facebook-story-${format}.png`);
  });
}

for (const format of FORMATS) {
  test(`youtube-shorts / ${format}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(
      `${PAGE}?platform=youtube&placement=shorts&format=${format}` +
        "&business=Acme%20Skin%20Co.&cta=Shop%20now&likes=12K&comments=340" +
        "&copy=I%20tried%20this%20for%2030%20days%20so%20you%20don%27t%20have%20to"
    );
    await expect(page).toHaveScreenshot(`youtube-shorts-${format}.png`);
  });

  test(`youtube-desktop / ${format}`, async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 480 });
    await page.goto(
      `${PAGE}?platform=youtube&placement=desktop&format=${format}` +
        "&business=Acme%20Skin%20Co.&cta=Visit%20site&domain=shop.acme.com" +
        "&headline=The%2030-day%20results%20speak%20for%20themselves&likes=1.2K&views=74.1K"
    );
    await expect(page).toHaveScreenshot(`youtube-desktop-${format}.png`);
  });
}

test("facebook / no params (pure defaults)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto(PAGE);
  await expect(page).toHaveScreenshot("facebook-defaults.png");
});
