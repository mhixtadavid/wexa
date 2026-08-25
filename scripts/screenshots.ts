import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium, type Page } from "playwright";

/**
 * Captures the README screenshots against a locally running production build.
 *
 * Kept in the repo so the images can be regenerated after a UI change rather
 * than becoming stale artefacts nobody can reproduce. Run with:
 *
 *   npm run build && npm start &
 *   npx tsx scripts/screenshots.ts
 */
const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "docs/screenshots");

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  // Web fonts shift layout noticeably; wait for them before capturing.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await context.newPage();

  const shot = async (name: string, fullPage = false) => {
    await page.screenshot({ path: resolve(OUT, name + ".png"), fullPage });
    console.log("  captured " + name + ".png");
  };

  console.log("\nCapturing screenshots from " + BASE + "\n");

  // 1. Dashboard
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await settle(page);
  await shot("dashboard");

  // 2. Application detail, scrolled to the headline maintainer-exposure table.
  await page.goto(BASE + "/apps/n8n", { waitUntil: "domcontentloaded" });
  await settle(page);
  await shot("application");

  const exposure = page.getByText("Who can publish into this application");
  await exposure.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await shot("maintainer-exposure");

  // 3. The blast-radius ring diagram.
  await page.goto(BASE + "/packages/debug", { waitUntil: "domcontentloaded" });
  await settle(page);
  const figure = page.locator("figure").first();
  await figure.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await shot("blast-radius");

  // 4. "Why is this here?" — expanded, showing the chains.
  await page.goto(BASE + "/apps/verdaccio", { waitUntil: "domcontentloaded" });
  await settle(page);
  const why = page.getByRole("button", { name: "Why is this here?" }).first();
  await why.scrollIntoViewIfNeeded();
  await why.click();
  await page.waitForSelector("text=/route[s]? pull this package in|One route pulls/", {
    timeout: 20_000,
  });
  await page.waitForTimeout(400);
  await shot("why");

  // 5. Maintainer reach.
  await page.goto(BASE + "/maintainers/sindresorhus", { waitUntil: "domcontentloaded" });
  await settle(page);
  await shot("maintainer");

  // 6. The database-unreachable state, forced by failing the health endpoint.
  await page.route("**/api/health", (route) => route.abort());
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Database unreachable", { timeout: 20_000 });
  await page.waitForTimeout(300);
  await shot("error-state");
  await page.unroute("**/api/health");

  // 7. Dark mode, driven by the OS preference rather than the toggle so the
  //    capture does not depend on click timing.
  const darkContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const darkPage = await darkContext.newPage();
  await darkPage.goto(BASE + "/apps/n8n", { waitUntil: "domcontentloaded" });
  await settle(darkPage);
  await darkPage.screenshot({ path: resolve(OUT, "dark-mode.png") });
  await darkContext.close();
  console.log("  captured dark-mode.png");

  // 8. The data-model diagram, captured from a standalone page so the README
  //    has a PNG for viewers that do not render Mermaid.
  await page.goto("file://" + resolve(process.cwd(), "scripts/data-model.html"));
  await settle(page);
  const diagram = page.locator("#diagram");
  await diagram.screenshot({ path: resolve(OUT, "data-model.png") });
  console.log("  captured data-model.png");

  await browser.close();
  console.log("\nDone. Images in docs/screenshots/\n");
}

main().catch((error: unknown) => {
  console.error("\n  Screenshot run failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
