// Builds public/signalbase-product-knowledge.pdf from the website's own content and pricing data.
//   npm run brochure            (uses Chrome at CHROME_PATH, default: the macOS install)
// Re-run after changing src/components/landing/content.ts or src/components/pricing/plans.ts, then commit the PDF.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import puppeteer from "puppeteer-core";
import { Brochure } from "./Brochure";

const OUT = resolve("public/signalbase-product-knowledge.pdf");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  const html = "<!doctype html>" + renderToStaticMarkup(<Brochure />);
  if (process.argv.includes("--html")) writeFileSync(resolve("public/signalbase-product-knowledge.html"), html);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluateHandle("document.fonts.ready");
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  await browser.close();
  writeFileSync(OUT, pdf);
  console.log(`Wrote ${OUT} (${Math.round(pdf.length / 1024)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
