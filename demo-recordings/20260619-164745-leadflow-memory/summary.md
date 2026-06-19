# LeadFlow Memory — 演示视频录制摘要

录制时间：2026-06-19
工具：Playwright（Chromium，无头）+ ffmpeg 转码

## 演示内容（转化 Agent 工作台 / Conversion Agent Workbench）

1. 打开工作台，展示「房产线索」列表与可验证数据层状态
2. 选择高意向线索「陈薇」（A 级）
3. 客户画像：预算 130 万以内 / 区域 渝北 / 需求标签 / 来源信号 / 最近客户回复
4. 跟进话术 Tab：记忆驱动的下一步消息 +「本次使用的记忆」
5. MemWal 记忆 Tab：长期语义记忆条目
6. Walrus Artifacts Tab：可验证物料（blob 哈希）
7. Agent Trace Tab：决策轨迹时间线
8. 底部「记忆时间线 · 当前进度」进度带
9. 切换 EN / 中文，展示 i18n
10. 回到跟进话术总览收尾

## 产物

- MP4：recording.mp4（1440x1000，H.264，约 17.9s，~650KB）
- WebM：recording.webm（~1.5MB，原始捕获）
- 脚本：demo.spec.mjs
- 日志：run.log
- 首帧海报：poster.png

## 运行环境（安全沙箱，未触碰真实数据）

为避免录到真实客户数据 / 触发真机发消息，**没有使用仓库默认的真实后端**
（根 `.env` 指向真实 Supabase 库且 `AUTO_FOLLOWUP_ENABLED=true` + 真实 Android 设备号）。
改为启动了一套全 fake、纯内存的后端：

- API：`apps/api`，端口 3002，env：`LLM_PROVIDER/MEMWAL_MODE/WALRUS_MODE/XHS_CHAT_MODE/XHS_DISCOVERY_MODE=fake`，
  `AUTO_FOLLOWUP_ENABLED=false`，未设 `DATABASE_URL`（走内存 store）
- 通过 `POST /api/demo/seed-real-estate` 注入演示线索「陈薇」（虚构数据）
- Web：`apps/web`，端口 5174，`VITE_API_BASE_URL=http://127.0.0.1:3002`
- 用户原有的真实后端（端口 3001）全程未被改动

## 复现命令

```bash
# 1) 启动 fake 后端（端口 3002）
cd apps/api
env -u DATABASE_URL LLM_PROVIDER=fake MEMWAL_MODE=fake WALRUS_MODE=fake \
  XHS_CHAT_MODE=fake XHS_DISCOVERY_MODE=fake AUTO_FOLLOWUP_ENABLED=false PORT=3002 \
  ../../node_modules/.bin/tsx src/index.ts &
curl -s -X POST http://127.0.0.1:3002/api/demo/seed-real-estate

# 2) 启动 web（端口 5174，指向 fake 后端）
cd ../web
VITE_API_BASE_URL=http://127.0.0.1:3002 ../../node_modules/.bin/vite --host 127.0.0.1 --port 5174 &

# 3) 录制
node demo-recordings/20260619-164745-leadflow-memory/demo.spec.mjs
```

## 备注 / 局限

- 右侧「设备实时画面」栏在 fake 模式下没有真机截图，显示为深色空屏（仅此一处非内容区域）。
- 仓库未安装 playwright 依赖，脚本复用了 npx 缓存中的 playwright 1.61，并显式指向已下载的 chromium-1223 可执行文件（见脚本顶部，可用 `PLAYWRIGHT_MODULE` / `PLAYWRIGHT_CHROMIUM` 覆盖）。
