// 复用 npx 缓存中的 playwright（仓库未安装该依赖，避免污染 package.json）。
// 可用 PLAYWRIGHT_MODULE 覆盖为本地安装路径。
const playwrightEntry =
  process.env.PLAYWRIGHT_MODULE ??
  'file:///Users/jethrozz/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const playwrightModule = await import(playwrightEntry);
const chromium = (playwrightModule.chromium ?? playwrightModule.default?.chromium);
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:5174';
const runDir =
  process.env.DEMO_RUN_DIR ??
  '/Users/jethrozz/Documents/UGit/LeadFlow-Memory/demo-recordings/20260619-164745-leadflow-memory';
const webmPath = process.env.DEMO_WEBM_PATH ?? path.join(runDir, 'recording.webm');
const logPath = process.env.DEMO_LOG_PATH ?? path.join(runDir, 'run.log');
const steps = [];

function log(step) {
  steps.push(`${new Date().toISOString()} ${step}`);
  console.log(step);
}

const beat = (page, ms = 1000) => page.waitForTimeout(ms);
// 简易断言：等待元素可见，替代 @playwright/test 的 expect().toBeVisible()
const show = (locator, timeout = 15000) => locator.first().waitFor({ state: 'visible', timeout });

await mkdir(runDir, { recursive: true });

// 缓存里的浏览器版本与 playwright 1.61 默认不一致，显式指向已下载的 chromium-1223。
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM ??
  '/Users/jethrozz/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  recordVideo: { dir: runDir, size: { width: 1440, height: 1000 } },
});

const page = await context.newPage();
const video = page.video();

try {
  log('打开 转化 Agent 工作台');
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await show(page.getByRole('heading', { name: 'Auto Lead Flow' }));
  await show(page.getByText('房产线索'));
  await beat(page, 1400);

  log('选择高意向线索 陈薇');
  const leadRow = page.locator('.lead-row', { hasText: '陈薇' });
  await show(leadRow);
  await leadRow.click();

  log('展示客户画像（预算 / 区域 / 需求 / 来源信号）');
  await show(page.locator('.lead-profile').getByRole('heading', { name: '陈薇' }));
  await show(page.getByText('130万以内'));
  await beat(page, 1800);

  const tabRow = page.locator('.tab-row');

  log('跟进话术 Tab：记忆驱动的下一步消息');
  await tabRow.getByRole('button', { name: '跟进话术' }).click();
  await show(page.getByText('本次使用的记忆'));
  await beat(page, 2000);

  log('MemWal 记忆 Tab：长期语义记忆');
  await tabRow.getByRole('button', { name: 'MemWal 记忆' }).click();
  await show(page.locator('.memory-grid .memory-row'));
  await beat(page, 1800);

  log('Walrus Artifacts Tab：可验证物料');
  await tabRow.getByRole('button', { name: 'Walrus Artifacts' }).click();
  await show(page.locator('.artifact-list .artifact-row'));
  await beat(page, 1800);

  log('Agent Trace Tab：决策轨迹');
  await tabRow.getByRole('button', { name: 'Agent Trace' }).click();
  await show(page.locator('.trace-list .trace-row'));
  await beat(page, 1800);

  log('底部记忆时间线进度带');
  const timeline = page.locator('.timeline-strip');
  await timeline.scrollIntoViewIfNeeded();
  await show(page.getByText('记忆时间线 · 当前进度'));
  await beat(page, 1800);

  log('切换到英文界面，展示 i18n');
  const langToggle = page.getByRole('button', { name: '切换语言 / Switch language' });
  await langToggle.click();
  await show(page.getByRole('heading', { name: 'Conversion Agent Workbench' }));
  await beat(page, 2000);

  log('切回中文，回到跟进话术总览');
  await langToggle.click();
  await show(page.getByRole('heading', { name: '转化 Agent 工作台' }));
  await tabRow.getByRole('button', { name: '跟进话术' }).click();
  await show(page.getByText('本次使用的记忆'));
  await beat(page, 2200);
} finally {
  await context.close();
  await browser.close();
  await writeFile(logPath, `${steps.join('\n')}\n`, 'utf8');
}

if (video) {
  await copyFile(await video.path(), webmPath);
}
