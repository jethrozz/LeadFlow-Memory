import { createRequire } from "node:module";
import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire("/Users/jethrozz/Library/Application Support/office-raccoon/package.json");
const { chromium } = require("playwright");

const baseURL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:5173";
const apiURL = process.env.DEMO_API_URL ?? "http://127.0.0.1:3001";
const leadId = process.env.DEMO_LEAD_ID ?? "lead_mock_d27ab1d4";
const runDir =
  process.env.DEMO_RUN_DIR ??
  "/Users/jethrozz/Documents/UGit/LeadFlow-Memory/demo-recordings/20260619-184345-leadflow-jethrozz-english-handoff";
const timelinePath = process.env.DEMO_TIMELINE ?? path.join(runDir, "timeline.json");
const webmPath = process.env.DEMO_WEBM_PATH ?? path.join(runDir, "recording.webm");
const logPath = process.env.DEMO_LOG_PATH ?? path.join(runDir, "run.log");

const plan = JSON.parse(await readFile(timelinePath, "utf8"));
const steps = plan.steps;
const logs = [];

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  logs.push(line);
  console.log(message);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${url} failed: ${response.status}`);
  return response.json();
}

async function leadDetail() {
  return fetchJson(`${apiURL}/api/dashboard/leads/${leadId}`);
}

async function waitForVisible(locator, timeout = 20_000) {
  await locator.first().waitFor({ state: "visible", timeout });
}

async function installCaption(page) {
  await page.evaluate(() => {
    const existing = document.getElementById("__demo_caption");
    if (existing) existing.remove();
    const bar = document.createElement("div");
    bar.id = "__demo_caption";
    Object.assign(bar.style, {
      position: "fixed",
      left: "50%",
      bottom: "36px",
      transform: "translateX(-50%)",
      maxWidth: "72%",
      padding: "14px 24px",
      borderRadius: "12px",
      background: "rgba(8,12,20,0.84)",
      color: "#fff",
      textAlign: "center",
      font: "600 23px/1.35 system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      zIndex: "999999",
      opacity: "0",
      transition: "opacity .22s ease",
      boxShadow: "0 8px 30px rgba(0,0,0,.32)",
      pointerEvents: "none",
    });
    bar.textContent = "";
    document.body.appendChild(bar);
    window.__setCaption = (text) => {
      bar.textContent = text || "";
      bar.style.opacity = text ? "1" : "0";
    };
  });
}

async function caption(page, step) {
  await page.evaluate((text) => window.__setCaption(text), step.cn);
}

async function hold(page, step) {
  await page.waitForTimeout(step.holdMs);
}

async function waitForNewTimelineEvent(baselineCount, type, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const detail = await leadDetail();
    const added = (detail.timeline ?? []).slice(baselineCount);
    if (added.length > 0 && (!type || added.some((event) => event.type === type))) return detail;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return null;
}

await mkdir(runDir, { recursive: true });

const initialDetail = await leadDetail();
const baselineTimelineCount = initialDetail.timeline.length;
log(`baseline lead=${leadId} status=${initialDetail.lead.status} timeline=${baselineTimelineCount}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  recordVideo: { dir: runDir, size: { width: 1440, height: 1000 } },
});
await context.addInitScript(() => {
  window.localStorage.setItem("leadflow-lang", "en");
});
const page = await context.newPage();
const video = page.video();

try {
  log("open app");
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await waitForVisible(page.getByRole("heading", { name: "Conversion Agent Workbench" }));
  await waitForVisible(page.getByText("Property Leads"));
  await installCaption(page);

  const leadRow = page.locator(".lead-row", { hasText: "jethrozz" });
  const tabRow = page.locator(".tab-row");
  const startButton = page.getByRole("button", { name: "Start follow-up" });
  const crashButton = page.getByRole("button", { name: "Simulate crash" });

  log("step 01 overview");
  await caption(page, steps[0]);
  await hold(page, steps[0]);

  log("step 02 select jethrozz lead");
  await waitForVisible(leadRow);
  await leadRow.click();
  await waitForVisible(page.getByRole("heading", { name: "jethrozz" }));
  await caption(page, steps[1]);
  await hold(page, steps[1]);

  log("step 03 show profile");
  await waitForVisible(page.getByText("150 万以内"));
  await waitForVisible(page.getByText("高新区"));
  await caption(page, steps[2]);
  await hold(page, steps[2]);

  log("step 04 show memory and artifacts");
  await tabRow.getByRole("button", { name: "MemWal Memory" }).click();
  await waitForVisible(page.locator(".memory-grid .memory-row"));
  await page.waitForTimeout(900);
  await tabRow.getByRole("button", { name: "Walrus Artifacts" }).click();
  await waitForVisible(page.locator(".artifact-list .artifact-row"));
  await caption(page, steps[3]);
  await hold(page, steps[3]);

  log("step 05 click start follow-up only");
  await tabRow.getByRole("button", { name: "Follow-up Script" }).click();
  await waitForVisible(startButton);
  await startButton.click();
  await page.waitForTimeout(1200);
  await caption(page, steps[4]);
  await hold(page, steps[4]);

  log("step 06 wait for background worker");
  await caption(page, steps[5]);
  const sentAfterStart = await waitForNewTimelineEvent(baselineTimelineCount, "agent_replied", 45_000);
  log(sentAfterStart ? `background worker timeline=${sentAfterStart.timeline.length}` : "no new agent_replied during start-follow-up window");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForVisible(page.getByRole("heading", { name: "Conversion Agent Workbench" }));
  await installCaption(page);
  await page.locator(".lead-row", { hasText: "jethrozz" }).click();
  await tabRow.getByRole("button", { name: "Agent Trace" }).click();
  await waitForVisible(page.locator(".trace-list .trace-row"));
  await hold(page, steps[5]);

  log("step 07 simulate crash");
  await tabRow.getByRole("button", { name: "Follow-up Script" }).click();
  await waitForVisible(crashButton);
  await crashButton.click();
  await waitForVisible(page.getByText(/Worker crashed|Handoff recovery in progress|Handoff succeeded/), 15_000);
  await caption(page, steps[6]);
  await hold(page, steps[6]);

  log("step 08 wait for handoff recovery overlay");
  await caption(page, steps[7]);
  const recoveredDuringOverlay = await waitForNewTimelineEvent(
    baselineTimelineCount,
    "handoff_recovered",
    160_000,
  );
  if (recoveredDuringOverlay) log(`handoff recovered during overlay timeline=${recoveredDuringOverlay.timeline.length}`);
  else log("handoff recovery was not observed during overlay wait");
  await hold(page, steps[7]);

  log("step 09 show recovered timeline");
  await page.keyboard.press("Escape").catch(() => {});
  const recovered = await waitForNewTimelineEvent(baselineTimelineCount, "handoff_recovered", 90_000);
  if (recovered) log(`handoff recovered timeline=${recovered.timeline.length}`);
  else log("handoff recovery was not observed after crash within the recording window");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForVisible(page.getByRole("heading", { name: "Conversion Agent Workbench" }));
  await installCaption(page);
  await page.locator(".lead-row", { hasText: "jethrozz" }).click();
  await tabRow.getByRole("button", { name: "Agent Trace" }).click();
  await waitForVisible(page.getByText("Handoff recovered"));
  await caption(page, steps[8]);
  await hold(page, steps[8]);

  await page.evaluate(() => window.__setCaption(""));
  await page.waitForTimeout(500);
} finally {
  await context.close();
  await browser.close();
  await writeFile(logPath, `${logs.join("\n")}\n`, "utf8");
}

if (video) await copyFile(await video.path(), webmPath);
