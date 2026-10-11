# Audio polish sources and verification

The original soundtrack and discipline-specific effects remain in use. Original asset files are unchanged. Original effects are balanced after decoding (RMS target 0.17, maximum boost 6×, peak ceiling 0.82); a shared compressor limits dense mixes before the effects-volume control. Music briefly ducks to 65% of its selected volume for fight/result announcements only.

## Added free assets

Author: Kenney. Official pages checked on 11 October 2026:

- [Interface Sounds 1.0](https://kenney.nl/assets/interface-sounds): 100 files, CC0.
- [Impact Sounds 1.0](https://kenney.nl/assets/impact-sounds): 130 files, CC0.
- [CC0 license](https://creativecommons.org/publicdomain/zero/1.0/).

Downloaded without payment from the official free download links:

- `https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip`
- `https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip`

Only 16 used samples are shipped. Original archive inputs are temporary, outside the repository. The exact license texts supplied with both packs are in `public/assets/audio/polish/LICENSE-Kenney-*.txt`. `provenance.json` records each original file path, source SHA-256, shipped SHA-256, duration and bytes.

Transform for every selected file (ffmpeg):

```
-af silenceremove=start_periods=1:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,loudnorm=I=-20:TP=-3:LRA=7 -ac 1 -ar 44100 -map_metadata -1 -c:a pcm_s16le
```

Short clips do not always admit integrated loudness measurement; decoded RMS/peak balancing supplies bounded consistent levels at playback. WAV is used for broad native decoding and these very short samples.

## Cue use

| Purpose | Selected samples |
| --- | --- |
| Navigate / confirm / change | select_001 / click_003 / switch_002 |
| Back / open / close | back_001 / open_001 / close_001 |
| Ready / start / result | confirmation_002 |
| Unready / pause / resume / respawn | minimize_001 / maximize_001 |
| Error | error_003 |
| Light contact variants | impactPunch_medium_000 / 001 |
| Heavy contact variants / fall | impactSoft_heavy_000 / 001 |
| Block | impactWood_light_000 |
| Landing | impactSoft_medium_000 |

Punch/sweep windups retain original sounds and communicate misses even without contact. Special activation/contact retains discipline-specific original effects. Contact layers use foley instead of electronic beeps. Pitch varies by only ±3% for ordinary effects; announcement pitch stays fixed. Panning is limited to ±0.55. Jump/landing cues use consecutive snapshots only, skipping initial state, paused/resumed state, large tick gaps, teleports, changed lives and invulnerability.

UI cues are callable in menus and paused states. Same semantic cues are throttled (75 ms navigate/change, 110 ms others). First-gesture playback uses a short quiet procedural sine cue when samples are not decoded yet; it is played immediately rather than queued. Effects have a 16-voice limit, sample-level throttling, event-ID deduplication and a 150 ms maximum async load age. Scene changes and hidden/destroyed/muted state invalidate pending playback. Hidden pages stop effects and suspend the context; original streamed music resumes when appropriate.

## Verification

Type/build checks and an isolated Chromium browser audio exercise validate native decoding, live Web Audio graph/voice creation, first trusted gesture, UI and combat playback, deduplication, zero-volume behavior, stale scene cancellation, visibility-handler behavior and destruction. Visibility state was injected before dispatching the visibility event; this verifies the handler rather than an actual background tab transition. These are synthetic browser inputs and graph observations, not human listening or real speaker/controller verification. Final subjective mix acceptance requires human playtesting.

Observed Chromium results: running context, 34 decoded buffers; first trusted gesture produced a voice immediately; hit/block/RAM produced 3 voices and event replay remained 3; RAM decoded peak 0.820, RMS 0.096; UI in silent scene produced 1 voice; volume zero produced 0; scene cancellation produced 0; injected hidden state suspended context and stopped voices; visible state resumed it; destruction closed it. No page errors. The 16 added mono 44.1 kHz PCM files total 330,240 bytes. Typecheck and production build passed (existing large-chunk advisory remains).

Integrated full-application verification also exercised actual menu click/hover/change/ready, worker-driven match completion, pause/resume, hidden-handler re-entry and mute. Raw CDP hover before user activation created no audio sources or media plays. After activation, menu interactions and match results created native sources; effects volume zero created none. Visibility was injected, and these observations do not substitute for subjective listening.
