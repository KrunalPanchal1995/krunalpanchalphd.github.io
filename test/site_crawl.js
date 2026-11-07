// Live/local site crawl: visits every sitemap URL in desktop + phone viewports and reports
// HTTP status, console errors, failed requests, broken images, broken internal links, horizontal overflow.
//   SITE=https://krunalpanchal1995.github.io node test/site_crawl.js
const { chromium } = require("@playwright/test");
const fs = require("fs");

const SITE = (process.env.SITE || "https://krunalpanchal1995.github.io").replace(/\/$/, "");
const VIEWPORTS = { desktop: { width: 1366, height: 900 }, phone: { width: 390, height: 844 } };

(async () => {
  const xml = await (await fetch(SITE + "/sitemap.xml")).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, SITE));
  const browser = await chromium.launch();
  const report = [];
  const linkCache = new Map();

  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport });
    for (const url of urls) {
      const page = await ctx.newPage();
      const issues = [];
      page.on("console", (m) => m.type() === "error" && issues.push("console: " + m.text().slice(0, 160)));
      page.on("pageerror", (e) => issues.push("pageerror: " + String(e.message).slice(0, 160)));
      page.on("requestfailed", (r) => issues.push("reqfail: " + r.url().slice(0, 120) + " " + (r.failure()?.errorText || "")));
      page.on("response", (r) => r.status() >= 400 && issues.push(`http ${r.status()}: ${r.url().slice(0, 120)}`));
      let status = 0;
      try {
        const resp = await page.goto(url, { waitUntil: "load", timeout: 45000 });
        status = resp ? resp.status() : 0;
        await page.waitForTimeout(1200);
        const bad = await page.evaluate(() => ({
          images: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src.slice(0, 120)),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          links: [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => h.startsWith(location.origin) && !h.includes("#")))],
        }));
        bad.images.forEach((s) => issues.push("broken image: " + s));
        if (bad.overflow > 4) issues.push(`horizontal overflow ${bad.overflow}px`);
        if (vpName === "desktop") {
          for (const l of bad.links) {
            if (!linkCache.has(l)) {
              const r = await ctx.request.head(l).catch(() => null);
              linkCache.set(l, r ? r.status() : 0);
            }
            if (linkCache.get(l) >= 400 || linkCache.get(l) === 0) issues.push(`broken link ${linkCache.get(l)}: ${l}`);
          }
        }
      } catch (e) {
        issues.push("navigation: " + e.message.slice(0, 120));
      }
      report.push({ viewport: vpName, url, status, issues: [...new Set(issues)] });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(process.env.OUT || "site_crawl_report.json", JSON.stringify(report, null, 2));
  const failing = report.filter((r) => r.status !== 200 || r.issues.length);
  console.log(`${report.length} page-visits, ${failing.length} with issues`);
  for (const f of failing) console.log(`[${f.viewport}] ${f.status} ${f.url}\n   - ${f.issues.join("\n   - ")}`);
})();
