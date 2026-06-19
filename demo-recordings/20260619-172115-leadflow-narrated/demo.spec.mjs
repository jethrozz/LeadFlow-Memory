// 带中英双语字幕 overlay + 按 timeline.json 配速的演示录制。
// 复用 npx 缓存中的 playwright 1.61 + 已下载的 chromium-1223（仓库未装该依赖）。
const playwrightEntry =
  process.env.PLAYWRIGHT_MODULE ??
  'file:///Users/jethrozz/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const playwrightModule = await import(playwrightEntry);
const chromium = playwrightModule.chromium ?? playwrightModule.default?.chromium;
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:5174';
const runDir =
  process.env.DEMO_RUN_DIR ??
  '/Users/jethrozz/Documents/UGit/LeadFlow-Memory/demo-recordings/20260619-172115-leadflow-narrated';
const timelinePath = process.env.DEMO_TIMELINE ?? path.join(runDir, 'timeline.json');
const webmPath = process.env.DEMO_WEBM_PATH ?? path.join(runDir, 'recording.webm');
const logPath = process.env.DEMO_LOG_PATH ?? path.join(runDir, 'run.log');
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM ??
  '/Users/jethrozz/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const plan = JSON.parse(await readFile(timelinePath, 'utf8'));
const steps = plan.steps;
const logs = [];
const log = (s) => { logs.push(`${new Date().toISOString()} ${s}`); console.log(s); };
const show = (loc, t = 15000) => loc.first().waitFor({ state: 'visible', timeout: t });

await mkdir(runDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  recordVideo: { dir: runDir, size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
const video = page.video();

async function installCaption() {
  await page.evaluate(() => {
    const bar = document.createElement('div');
    bar.id = '__demo_caption';
    Object.assign(bar.style, {
      position: 'fixed', left: '50%', bottom: '48px', transform: 'translateX(-50%)',
      maxWidth: '78%', padding: '14px 26px', borderRadius: '14px',
      background: 'rgba(8,12,20,0.82)', color: '#fff', textAlign: 'center',
      font: '500 26px/1.35 system-ui, "PingFang SC", sans-serif',
      zIndex: '999999', opacity: '0', transition: 'opacity .25s ease',
      boxShadow: '0 8px 30px rgba(0,0,0,.35)', pointerEvents: 'none',
    });
    bar.innerHTML =
      '<div class="cn"></div><div class="en" style="font-size:17px;opacity:.78;margin-top:4px"></div>';
    document.body.appendChild(bar);
    window.__setCaption = (cn, en) => {
      bar.querySelector('.cn').textContent = cn || '';
      bar.querySelector('.en').textContent = en || '';
      bar.style.opacity = cn ? '1' : '0';
    };
  });
}

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await show(page.getByRole('heading', { name: 'Auto Lead Flow' }));
  await installCaption();

  const leadRow = page.locator('.lead-row', { hasText: '陈薇' });
  const tabRow = page.locator('.tab-row');
  const langToggle = page.getByRole('button', { name: '切换语言 / Switch language' });

  // 与 narration.json 同序的演示动作（intro/讲解步骤无操作）
  const actions = [
    async () => { await show(page.getByText('房产线索')); },                                   // 01 intro
    async () => { await show(leadRow); await leadRow.click(); },                                // 02 选中陈薇
    async () => { await show(page.getByText('130万以内')); },                                   // 03 画像
    async () => { await tabRow.getByRole('button', { name: '跟进话术' }).click();
                  await show(page.getByText('本次使用的记忆')); },                              // 04 跟进话术
    async () => { await tabRow.getByRole('button', { name: 'MemWal 记忆' }).click();
                  await show(page.locator('.memory-grid .memory-row')); },                      // 05 记忆
    async () => { await tabRow.getByRole('button', { name: 'Walrus Artifacts' }).click();
                  await show(page.locator('.artifact-list .artifact-row')); },                  // 06 物料
    async () => { await tabRow.getByRole('button', { name: 'Agent Trace' }).click();
                  await show(page.locator('.trace-list .trace-row')); },                        // 07 trace
    async () => { await page.locator('.timeline-strip').scrollIntoViewIfNeeded();
                  await show(page.getByText('记忆时间线 · 当前进度')); },                       // 08 时间线
    async () => { await langToggle.click();
                  await show(page.getByRole('heading', { name: 'Conversion Agent Workbench' })); }, // 09 EN
    async () => { await langToggle.click();
                  await show(page.getByRole('heading', { name: '转化 Agent 工作台' }));
                  await tabRow.getByRole('button', { name: '跟进话术' }).click(); },            // 10 收尾
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    log(`step ${step.id} (${step.holdMs}ms): ${step.cn}`);
    if (actions[i]) await actions[i]();
    await page.evaluate(([cn, en]) => window.__setCaption(cn, en), [step.cn, step.en]);
    await page.waitForTimeout(step.holdMs);
  }
  await page.evaluate(() => window.__setCaption('', ''));
  await page.waitForTimeout(400);
} finally {
  await context.close();
  await browser.close();
  await writeFile(logPath, `${logs.join('\n')}\n`, 'utf8');
}

if (video) await copyFile(await video.path(), webmPath);
