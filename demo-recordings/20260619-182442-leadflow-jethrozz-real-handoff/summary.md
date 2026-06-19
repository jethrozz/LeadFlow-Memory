# LeadFlow jethrozz Real Handoff Demo

- Target app: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`
- Lead: `lead_mock_d27ab1d4` / `jethrozz`
- UI language: English (`leadflow-lang=en`)
- Manual Send button: not clicked
- Business actions recorded: `Start follow-up`, `Simulate crash`

## Outputs

- Silent WebM: `recording.webm`
- Silent MP4: `recording.mp4`
- Narrated MP4: `recording-narrated.mp4`
- Actual bilingual subtitles: `recording-actual.srt`
- Original estimated subtitles: `recording.srt`
- Narration manifest: `narration.json`
- TTS segments: `audio/`
- Actual timeline: `timeline-actual.json`
- Recording script: `demo.spec.mjs`
- Run log: `run.log`

## Verification

- Final narrated MP4 duration: 142.16 seconds.
- Final narrated MP4 streams: H.264 video + AAC audio.
- Audio check: `volumedetect` max volume around `-1.1 dB`.
- Subtitle cue count: 9.
- Second recording captured a new `handoff_recovered` event; run log ends with `handoff recovered timeline=16`.
- API state after recording shows new `agent_replied`, `handoff_triggered`, and `handoff_recovered` events for `jethrozz`.
- Sensitive credential scan found no matching key material in the recording directory.

## Notes

- The flow uses the already-running local services and the current `jethrozz` lead; no new mock lead or demo seed was created.
- The UI remains English, while lead data and conversation content stay in their original Chinese data form by project i18n design.
