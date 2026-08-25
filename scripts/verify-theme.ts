import { chromium } from "playwright";

/**
 * Verifies the theme toggle end to end: that it cycles, that the choice
 * survives a reload, that it overrides the OS preference in both directions,
 * and that the stored theme is applied before first paint.
 */
const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  let failures = 0;

  const check = (label: string, actual: unknown, expected: unknown) => {
    const ok = actual === expected;
    if (!ok) failures += 1;
    console.log(
      "  " + (ok ? "OK  " : "FAIL") + " " + label.padEnd(52) + String(actual) + (ok ? "" : "  (expected " + expected + ")"),
    );
  };

  const bg = (page: import("playwright").Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  // --- OS light, no stored preference -------------------------------------
  let context = await browser.newContext({ colorScheme: "light" });
  let page = await context.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  check("OS light, no choice: data-theme absent",
    await page.evaluate(() => document.documentElement.getAttribute("data-theme")), null);
  const lightBg = await bg(page);
  check("OS light, no choice: light background", lightBg, "rgb(251, 251, 253)");

  const toggle = page.getByRole("button", { name: /^Theme:/ });

  await toggle.click(); // system -> light
  check("after 1 click: explicit light",
    await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");

  await toggle.click(); // light -> dark
  check("after 2 clicks: explicit dark",
    await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
  check("dark palette applied", await bg(page), "rgb(11, 11, 15)");

  // Persistence across a reload, and no flash: the attribute must already be
  // present on the very first evaluation after navigation.
  await page.reload({ waitUntil: "domcontentloaded" });
  check("survives reload",
    await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
  check("dark applied before paint (no flash)", await bg(page), "rgb(11, 11, 15)");

  await toggle.click(); // dark -> system
  check("after 3 clicks: back to system",
    await page.evaluate(() => document.documentElement.getAttribute("data-theme")), null);
  check("returns to OS light", await bg(page), "rgb(251, 251, 253)");

  await context.close();

  // --- OS dark ------------------------------------------------------------
  context = await browser.newContext({ colorScheme: "dark" });
  page = await context.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  check("OS dark, no choice: dark background", await bg(page), "rgb(11, 11, 15)");

  const toggle2 = page.getByRole("button", { name: /^Theme:/ });
  await toggle2.click(); // system -> light, overriding a dark OS
  check("explicit light overrides dark OS", await bg(page), "rgb(251, 251, 253)");

  await context.close();
  await browser.close();

  console.log("\n  " + (failures === 0 ? "all checks passed" : failures + " check(s) failed") + "\n");
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
