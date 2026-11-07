// Interaction smoke test against a live/local site: clicks through the home page controls, hero modes,
// search, theme, menus, and the main pages, and fails on console/page errors.
//   SITE=https://krunalpanchal1995.github.io node test/site_interact.js
const { chromium } = require("@playwright/test");
const SITE = (process.env.SITE || "https://krunalpanchal1995.github.io").replace(/\/$/, "");
const results = [];
const errors = [];
async function step(name, fn) {
  const before = errors.length;
  try { const note = await fn(); const newErr = errors.slice(before);
    results.push({ name, ok: newErr.length === 0, note: note || "", errors: newErr });
  } catch (e) { results.push({ name, ok: false, note: String(e.message).split("\n")[0].slice(0, 160), errors: errors.slice(before) }); }
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("ofsIgnore", "1"); } catch (e) {} }); // don't count test visits
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 140)));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 140)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`http ${r.status()}: ${r.url().slice(0, 120)}`));
  page.on("requestfailed", (r) => r.failure()?.errorText !== "net::ERR_ABORTED" && errors.push(`reqfail: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`)); // ERR_ABORTED = the browser cancelling in-flight loads on navigation
  const go = (u) => page.goto(SITE + u, { waitUntil: "domcontentloaded", timeout: 90000 }).then(() => page.waitForTimeout(2000));

  await step("home loads", async () => { await go("/"); return await page.title(); });

  for (const hero of ["fluid", "streamlines", "card3d", "photo"]) {
    await step(`hero mode ?hero=${hero}`, async () => {
      await go("/?hero=" + hero);
      const vis = await page.evaluate((h) => { const e = document.querySelector(`[data-hero="${h}"]`); return !!e && !e.hidden && e.getClientRects().length > 0; }, hero);
      if (!vis) throw new Error("hero not visible");
      if (hero === "card3d") { const c = await page.evaluate(() => !!document.querySelector('[data-hero="card3d"] canvas')); if (!c) throw new Error("no 3D canvas"); return "3D canvas present"; }
    });
  }

  await go("/");
  await step("theme toggle cycles to dark and back", async () => {
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const seen = new Set([await bg()]);
    for (let i = 0; i < 3; i++) { await page.click('button[aria-label="Change color theme"]'); await page.waitForTimeout(700); seen.add(await bg()); }
    if (seen.size < 2) throw new Error("background never changed: " + [...seen]); return seen.size + " distinct backgrounds";
  });
  await step("search opens, finds results, closes", async () => {
    await page.keyboard.press("Control+k"); await page.waitForTimeout(800);
    const input = page.locator('input[type="search"], input[type="text"]:visible, [role="combobox"]').first();
    await input.fill("neural"); await page.waitForTimeout(1500);
    const n = await page.evaluate(() => document.querySelectorAll('[role="option"], [class*="result"] a, ninja-keys, .search-result').length);
    await page.keyboard.press("Escape"); return `${n} result-ish nodes`;
  });
  await step("FX menu opens", async () => { await page.click('button[aria-label="Visual effects"]'); await page.waitForTimeout(400); await page.keyboard.press("Escape"); });
  await step("More menu opens with 5 items", async () => {
    await page.click("button.pillnav__morebtn"); await page.waitForTimeout(300);
    const n = await page.locator("a.pillnav__moreitem:visible").count(); if (n < 5) throw new Error("items visible: " + n); await page.keyboard.press("Escape"); return n + " items";
  });
  await step("How-this-works panel + KaTeX math", async () => {
    await page.evaluate(() => document.querySelector("#uh-toggle, .uh-toggle, button.uh-toggle, [class*=uh-toggle]")?.scrollIntoView());
    await page.locator("button:has-text('How this works')").first().click(); await page.waitForTimeout(2500);
    const k = await page.evaluate(() => document.querySelectorAll("#uh-panel .katex").length);
    if (!k) throw new Error("no KaTeX-rendered math in panel"); await page.locator("button.uh__close").first().click().catch(() => {}); return k + " math nodes";
  });
  await step("guide steps clickable", async () => { const s = page.locator("button.hg__step"); const n = await s.count(); for (let i = 0; i < n; i++) await s.nth(i).click({ timeout: 4000 }).catch(() => {}); return n + " steps"; });
  await step("showcase chips (Gallery/Subjects/Playground)", async () => {
    for (const t of ["Gallery", "Subjects", "Playground"]) { await page.locator(`button.hs__chip:has-text("${t}")`).first().click({ timeout: 5000 }); await page.waitForTimeout(600); }
  });
  await step("slideshow next/prev/pause", async () => {
    for (const l of ["Next slide", "Next slide", "Previous slide", "Pause automatic rotation"]) await page.locator(`button[aria-label="${l}"]`).first().click({ timeout: 5000 }).catch((e) => { throw new Error(l + ": " + e.message.split("\n")[0]); });
  });

  for (const [u, sel] of [["/studio/", "body"], ["/playground/", "body"], ["/reel/", "body"], ["/world/", "iframe"], ["/projects/", "body"], ["/publications/", "body"], ["/cv/", "body"]]) {
    await step(`page ${u} renders ${sel}`, async () => { await go(u); await page.waitForSelector(sel, { timeout: 15000, state: "attached" }); await page.waitForTimeout(sel === "iframe" ? 6000 : 1500);
      if (sel === "iframe") { const f = page.frames().filter((x) => x !== page.mainFrame()); const c = (await Promise.all(f.map((x) => x.evaluate(() => document.querySelectorAll("canvas").length).catch(() => 0)))).reduce((a, b) => a + b, 0); if (!c) throw new Error("iframe loaded but has no canvas"); } return (await page.title()).slice(0, 40); });
  }
  await step("project page: click a project card from /projects/", async () => {
    await go("/projects/"); const a = page.locator("a[href*='/projects/']:not([href$='/projects/'])").first(); const href = await a.getAttribute("href"); await a.click(); await page.waitForLoadState("domcontentloaded"); return href;
  });

  await browser.close();
  const bad = results.filter((r) => !r.ok);
  results.forEach((r) => console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? "  [" + r.note + "]" : ""}${r.errors.length ? "\n        " + [...new Set(r.errors)].join("\n        ") : ""}`));
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  require("fs").writeFileSync(process.env.OUT || "site_interact_report.json", JSON.stringify(results, null, 2));
})();
