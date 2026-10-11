# Classic simulation

`Simulation` has no Phaser, DOM, audio, or networking dependencies. The worker
calls one `step()` per 60 Hz tick and publishes a serializable `MatchSnapshot`.
It never advances more than one tick to catch up after browser suspension.

- `createMatch(config, matchId?)` validates the roster, resets the round, and
  begins a three-second countdown. Supply a fresh round identity for rematches.
- `setInputs(frames)` keeps the freshest input per human seat. `step(frames?)`
  also accepts inputs directly. Bots produce those same public input actions.
- `pause()` freezes rules and match time; `resume()` starts a new three-second
  countdown. Both clear input history and buffered requests.
- `forfeit(ids)` eliminates only those seats and applies ordinary team/FFA
  victory rules. `stop()` releases the current round.
- `snapshot()` returns a deep copy. `restore(snapshot, previousInputs?)` adopts
  public authoritative state for prediction. Pass last acknowledged input
  frames to preserve button edges. Hidden combo and bot history resets.
- `predict(frames?)` advances movement/startup without deciding hits, stocks, or
  results. Render/audio must use confirmed authority for those outcomes.

Coordinates use horizontal body centre and feet, including during crouch and
sweep. The logical collision body remains 60 units wide with heights 96, 64,
or 54. Visual canvas padding must not change these hit regions. `actionTime`
and effect `age` are seconds. `frame` is an original effect-frame index; each
effect's bounds already include the original per-frame size.

Combat reads a common post-movement, pre-resolution state. Exact simultaneous
attacks on one victim choose a stable seat-identity order; attacks on different
victims can trade. Directional guard blocks ordinary frontal punches only.
Source attack values use the victim's percentage before the hit. Effects are
owned by their action, disappear on interruption, and do not collide with
platforms. Mouse/ball disappear on their first valid opponent hit; teammates
with friendly fire disabled never consume them. Disc persists and deals 6% in
both directions. Selection has no hit window before frame 15.

Gameplay events retain 120 ticks of unique identities so transport can sample
the 60 Hz authority at 20 Hz without losing intervening sounds/visual cues.
Consumers must deduplicate by event ID and reset their history for a new
match identity. An attack event represents the action request/windup; any
delayed active cue must first verify that the action was not interrupted.

Validation follows the project policy: type/build checks and complete browser
matches, multiplayer exercises, and playtesting. No unit or isolated simulation
tests are included. Type checking passed during implementation; complete app
and multiplayer playtests belong to the integration acceptance work.
