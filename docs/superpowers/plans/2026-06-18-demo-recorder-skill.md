# Demo Recorder Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable `demo-recorder` Codex skill that scripts browser demos with Playwright, records WebM output, converts to MP4 when possible, and reports artifacts.

**Architecture:** Initialize the skill under `/Users/jethrozz/.codex/skills/demo-recorder` with `SKILL.md`, `agents/openai.yaml`, `references/`, and `scripts/`. Keep `SKILL.md` concise, move detailed Playwright patterns into references, and provide a deterministic helper script for artifact directory creation and optional ffmpeg conversion.

**Tech Stack:** Codex skills, Markdown, YAML frontmatter, Python 3 helper script, Playwright JavaScript examples, ffmpeg when available.

---

### Task 1: Initialize Skill Skeleton

**Files:**
- Create: `/Users/jethrozz/.codex/skills/demo-recorder/SKILL.md`
- Create: `/Users/jethrozz/.codex/skills/demo-recorder/agents/openai.yaml`
- Create: `/Users/jethrozz/.codex/skills/demo-recorder/references/`
- Create: `/Users/jethrozz/.codex/skills/demo-recorder/scripts/`

- [x] **Step 1: Run the skill initializer**

Run:

```bash
python3 /Users/jethrozz/.codex/skills/.system/skill-creator/scripts/init_skill.py demo-recorder --path /Users/jethrozz/.codex/skills --resources scripts,references --interface "display_name=Demo Recorder" --interface "short_description=Record browser demo videos with Playwright" --interface 'default_prompt=Use $demo-recorder to script a browser demo with Playwright, record it to WebM, convert to MP4 when possible, and return the media, script, and logs.'
```

Expected: a new `/Users/jethrozz/.codex/skills/demo-recorder` directory with `SKILL.md`, `agents/openai.yaml`, `references/`, and `scripts/`.

### Task 2: Add Reusable Helper Script

**Files:**
- Create: `/Users/jethrozz/.codex/skills/demo-recorder/scripts/recording_artifacts.py`

- [x] **Step 1: Create `recording_artifacts.py`**

Write a Python CLI that supports:

```bash
python3 scripts/recording_artifacts.py init --root demo-recordings --slug leadflow-dashboard
python3 scripts/recording_artifacts.py ffmpeg-status
python3 scripts/recording_artifacts.py convert --input recording.webm --output recording.mp4
```

Expected behavior:

- `init` prints JSON with `run_dir`, `script_path`, `log_path`, `webm_path`, `mp4_path`, and `summary_path`.
- `ffmpeg-status` exits `0` and prints the ffmpeg path when available, or exits `1` with a clear message when unavailable.
- `convert` runs `ffmpeg -y -loglevel error -i <input> -movflags +faststart -pix_fmt yuv420p <output>` and reports the output path.

### Task 3: Add Reference Docs

**Files:**
- Create: `/Users/jethrozz/.codex/skills/demo-recorder/references/playwright-recording-patterns.md`
- Create: `/Users/jethrozz/.codex/skills/demo-recorder/references/quality-checklist.md`

- [x] **Step 1: Write Playwright recording patterns**

Include a compact JavaScript pattern showing:

- Chromium launch.
- `recordVideo.dir`.
- `1440x1000` viewport.
- route navigation.
- robust locators and visible assertions.
- pacing waits only for legibility.
- closing context to flush video.
- copying the generated Playwright video to the standard WebM path.

- [x] **Step 2: Write the quality checklist**

Include checks for non-empty files, expected step logs, no blank page, no stuck loading state, no secrets, and MP4 conversion reporting.

### Task 4: Replace Skill Instructions

**Files:**
- Modify: `/Users/jethrozz/.codex/skills/demo-recorder/SKILL.md`
- Modify: `/Users/jethrozz/.codex/skills/demo-recorder/agents/openai.yaml`

- [x] **Step 1: Replace `SKILL.md`**

Write frontmatter:

```yaml
---
name: demo-recorder
description: Record browser-based product demo videos by generating Playwright automation scripts, running them with video capture, saving WebM recordings, converting to MP4 when ffmpeg is available, and reporting media/script/log artifacts. Use when Codex is asked to record a demo video, make a screencast, automate a web walkthrough, capture a product flow, or re-record a browser demo.
---
```

The body must define the automation-first workflow, confirmation gates for unclear or side-effectful flows, artifact layout, script generation guidance, conversion behavior, validation, and final-response expectations.

- [x] **Step 2: Verify `agents/openai.yaml`**

Ensure it matches:

```yaml
interface:
  display_name: "Demo Recorder"
  short_description: "Record browser demo videos with Playwright"
  default_prompt: "Use $demo-recorder to script a browser demo with Playwright, record it to WebM, convert to MP4 when possible, and return the media, script, and logs."
```

### Task 5: Validate Skill

**Files:**
- Validate: `/Users/jethrozz/.codex/skills/demo-recorder`

- [x] **Step 1: Test helper basics**

Run:

```bash
python3 /Users/jethrozz/.codex/skills/demo-recorder/scripts/recording_artifacts.py init --root /private/tmp/demo-recordings --slug smoke-test
```

Expected: JSON paths under `/private/tmp/demo-recordings/`.

- [x] **Step 2: Run skill validation**

Run:

```bash
python3 /Users/jethrozz/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jethrozz/.codex/skills/demo-recorder
```

Expected: validation passes.

### Task 6: Final Review

**Files:**
- Inspect: `/Users/jethrozz/.codex/skills/demo-recorder/SKILL.md`
- Inspect: `/Users/jethrozz/.codex/skills/demo-recorder/references/playwright-recording-patterns.md`
- Inspect: `/Users/jethrozz/.codex/skills/demo-recorder/references/quality-checklist.md`
- Inspect: `/Users/jethrozz/.codex/skills/demo-recorder/scripts/recording_artifacts.py`

- [x] **Step 1: Search for placeholders**

Run:

```bash
rg -n "TODO|TBD|FIXME|placeholder" /Users/jethrozz/.codex/skills/demo-recorder
```

Expected: no unresolved placeholders.

- [x] **Step 2: Report completion**

Final response should include created skill path, validation result, and helper smoke test result.
