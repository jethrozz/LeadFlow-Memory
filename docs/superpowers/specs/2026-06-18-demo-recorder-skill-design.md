# Demo Recorder Skill Design

## Goal

Create a reusable Codex skill named `demo-recorder` at `/Users/jethrozz/.codex/skills/demo-recorder`. The skill helps Codex record product demo videos by first writing a Playwright browser automation script, then running the script with Playwright video capture enabled.

The default behavior is automation-first: Codex should inspect the target project, start or verify the dev server, generate a task-specific Playwright script, record the run, and return the resulting video paths plus a concise summary. Codex should pause for confirmation only when the demo route is unclear or when the flow may perform real-world side effects such as sending messages, paying, deleting data, or using sensitive accounts.

## Scope

The skill supports:

- Recording browser-based product demos with Playwright.
- Producing a WebM recording by default.
- Producing an MP4 copy when `ffmpeg` is available.
- Keeping generated scripts, logs, and media in a predictable output directory.
- Checking basic recording quality before reporting success.
- Re-running or adjusting a recording when the first attempt is broken, blank, too fast, or misses the intended route.

The skill does not hard-code a specific app flow. Codex writes the Playwright automation script for each target project after reading the project context and understanding the requested demo.

## Architecture

The skill folder contains three parts:

- `SKILL.md`: concise workflow instructions, trigger guidance, safety gates, recording defaults, validation expectations, and final-response requirements.
- `references/`: optional detailed reference files for Playwright recording patterns, demo pacing, selectors, visual quality checks, and failure recovery.
- `scripts/`: a small helper for deterministic repeated work such as creating output folders, checking for `ffmpeg`, printing standard artifact paths, and optionally running WebM-to-MP4 conversion.

The Playwright script itself is generated inside the target project or a temporary task directory. This keeps the reusable skill generic while still allowing Codex to adapt to each app's routes, selectors, login state, and dev server commands.

## Default Workflow

1. Understand the demo goal, audience, target URL, and key moments.
2. Inspect the project for package manager, dev scripts, existing Playwright setup, and app routes.
3. Start or verify the local app server when needed.
4. Create a timestamped output directory such as `demo-recordings/YYYYMMDD-HHMMSS-<slug>/`.
5. Generate a Playwright script that drives the intended demo route.
6. Run the script with video capture enabled.
7. Save the WebM recording, script, and logs.
8. If `ffmpeg` is available, convert the recording to MP4.
9. Validate that the output files exist, have non-trivial size, and that the scripted steps completed.
10. Report the video path, script path, logs, and any caveats.

## Recording Rules

- Prefer Chromium unless the user or project requires another browser.
- Use a stable desktop viewport by default, such as `1440x1000`.
- Use explicit locators, visible-state waits, network-idle checks where appropriate, and assertions for important UI states.
- Avoid relying on fixed sleeps as the primary synchronization mechanism.
- Add short pacing waits only where they improve video legibility.
- Keep interactions human-readable: clear clicks, typed text, route transitions, and pauses on important screens.
- Avoid recording secrets, tokens, private customer data, or unnecessary browser chrome.
- Do not execute side-effectful flows without confirmation.

## Artifact Structure

Each recording run should produce a directory like:

```text
demo-recordings/
  20260618-153000-leadflow-dashboard/
    demo.spec.mjs
    run.log
    recording.webm
    recording.mp4
    summary.md
```

`recording.mp4` is present only when conversion succeeds. `summary.md` records the route, viewport, browser, important commands, and known caveats.

## Validation

Before claiming success, Codex should verify:

- The Playwright script exited successfully or the failure is explained.
- The WebM file exists and has meaningful size.
- The log includes the expected major steps.
- The app was not blank, stuck on a loading screen, or visibly broken during the flow when screenshots or browser verification are available.
- MP4 conversion succeeded when `ffmpeg` was available, or the final response clearly says why only WebM was produced.

## Skill Metadata

Name: `demo-recorder`

Trigger description should cover requests such as:

- "record a demo video"
- "use Playwright to record this flow"
- "generate a browser automation script and capture video"
- "re-record the product walkthrough"
- "make a demo screencast of this web app"

Suggested OpenAI metadata:

- Display name: `Demo Recorder`
- Short description: `Record browser demo videos with Playwright`
- Default prompt: `Use $demo-recorder to script a browser demo with Playwright, record it to WebM, convert to MP4 when possible, and return the media, script, and logs.`

## Open Questions Resolved

- Install location: `/Users/jethrozz/.codex/skills/demo-recorder`
- Default autonomy: full automation first, with confirmation for unclear or side-effectful routes
- Video output: WebM always, MP4 when `ffmpeg` is available
- Reusable resources: use both `references/` and `scripts/`
