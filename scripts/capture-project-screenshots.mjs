import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const DATA_PATH = "src/generated/portfolio.json";
const IMAGE_DIR = "public/generated/projects";
const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
await mkdir(IMAGE_DIR, { recursive: true });

function isPublicHttps(value) {
  if (!value) return false;
  const url = new URL(value);
  if (url.protocol !== "https:") return false;
  return !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const project of data.projects) {
    if (project.screenshot.toLowerCase() !== "auto" || !isPublicHttps(project.liveUrl)) continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    try {
      await page.goto(project.liveUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const settleTime = Math.max(0, Math.min(Number(project.screenshotWaitSeconds || 7), 240)) * 1_000;
      await page.waitForTimeout(settleTime);
      const target = path.join(IMAGE_DIR, `${project.id}.jpg`);
      await page.screenshot({ path: target, type: "jpeg", quality: 82, fullPage: false });
      await rm(path.join(IMAGE_DIR, `${project.id}.png`), { force: true });
      await rm(path.join(IMAGE_DIR, `${project.id}.svg`), { force: true });
      project.image = `/generated/projects/${project.id}.jpg`;
      console.log(`Captured ${project.title}: ${project.liveUrl}`);
    } catch (error) {
      console.warn(`Keeping existing preview for ${project.title}: ${error.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
