# LeadFlow Memory — 带字幕/配音演示（skill 升级验证样片）

录制时间：2026-06-19
用途：验证 demo-recorder skill 新增的「字幕 overlay + 语音解说」能力。

## 产物

- 🎬 带配音视频：recording-narrated.mp4（1440×1000，H.264 + AAC，约 54.8s）
- 📹 无声原始录制：recording.webm
- 📝 双语字幕：recording.srt（中英，10 条）
- 🗣️ 解说脚本：narration.json（10 步，cn 配音 / en 字幕）
- ⏱️ 时间轴：timeline.json（每步 start/end/holdMs，音画同步的唯一真相源）
- 🔊 配音分段：audio/01..10.wav
- 🎬 录制脚本：demo.spec.mjs（含字幕 overlay 注入 + 按 holdMs 配速）

## 重要说明：配音为占位音

本次 **没有可用的 MIMO_API_KEY**（仓库 .env 里的 LLM key 对 TTS 接口返回 401）。
因此 audio/*.wav 是用 ffmpeg 生成的**占位正弦音**，仅用于验证「TTS → 时间轴 → 混音 → 字幕」
整条流水线。画面字幕、音画同步、srt 全部为真实产物。

拿到有效 key 后，把占位步骤换成真实 TTS 即可得到真人解说：

```bash
export MIMO_API_KEY=<有效的小米 MiMo key>
RUN=demo-recordings/20260619-172115-leadflow-narrated
SK=/Users/jethrozz/.codex/skills/demo-recorder/scripts

# 1) 真实合成各段配音（覆盖占位音）
python3 $SK/xiaomi_tts.py batch --manifest $RUN/narration.json --out-dir $RUN/audio
# 2) 用真实时长重排时间轴
python3 $SK/narrate_demo.py plan --segments $RUN/audio/segments.json --gap 0.6 --lead-in 0.8 --out $RUN/timeline.json
# 3) 用新时间轴重录（字幕/配速随之对齐）
DEMO_TIMELINE=$RUN/timeline.json DEMO_RUN_DIR=$RUN node $RUN/demo.spec.mjs
# 4) 混音 + 字幕
python3 $SK/narrate_demo.py mux --video $RUN/recording.webm --timeline $RUN/timeline.json --out $RUN/recording-narrated.mp4
python3 $SK/narrate_demo.py srt --timeline $RUN/timeline.json --out $RUN/recording.srt
```

## 运行环境（安全沙箱）

与首版一致：未触碰真实后端（端口 3001 / 真实 Supabase / 真机自动发私信），
而是用全 fake、纯内存后端（API 3002 + Web 5174）+ demo seed 线索「陈薇」录制。
录制完成后已关闭沙箱，3001 全程未受影响。

## 校验结果

- ffprobe：视频 h264 + 音频 aac 双流，时长 54.8s ✓
- volumedetect：mean -21.7 dB / max -17.8 dB（音轨非静音）✓
- 抽帧 22s / 47s：中英双语字幕条清晰烧录在画面底部 ✓
- srt 条数 == 解说步数（10）✓
