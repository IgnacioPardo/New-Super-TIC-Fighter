# Playing New Super TIC Fighter v2

Press a key, click, or use controller confirm/Start to enter. Room and tournament links preserve their destination. A click/key press may be needed to enable sound in a controller-only session.

## Choose a mode

The title has three choices: **Play**, **Solo**, and **Online**. Profile and Settings are secondary header controls; the guide stays in the footer. Online groups Quick Play, Private Room and Tournaments.

- **Play:** couch stock, timed KO, Hill or Royale, optional bots, best-of-one/three/five. Stock defaults to three lives and five minutes; Timed/Hill default to three minutes.
- **Online → Private Room:** invitation rooms with direct P2P and relay fallback, including mixed couch/online groups, custom rules, and one/two-human Survival co-op. The host sets rules and starts after all seats are ready.
- **Online → Quick Play:** choose duel, four-player FFA, 2v2 or eight-player Royale. Invite friends into a party before queueing. 2v2 parties have at most two players; larger groups use FFA/Royale/private rooms. The server runs matches. No automatic public bots.
- **Solo:** eight-bout Arcade, Survival, twelve authored challenges, or Training. Hard bots have bounded reactions and understand expanded recovery/platforms.
- **Online → Tournaments:** duel or 2v2 elimination (best of three) and round robin (one bout per fixture). Enter local players independently or enter a two-player party as a team. Brackets persist; a shared browser's entrants are never assigned simultaneous bouts. Use the invitation link to return, and Refresh/Recover Match if needed. Only server results advance the bracket.
- **Profile:** optional Google/GitHub sign-in, explicit provider linking, passkey enrollment and cosmetic progress. Guests can play everything; additional couch players stay separate guests.

## Controls

| Action | Keyboard 1 | Keyboard 2 | Keyboard 3 | Keyboard 4 | Standard controller |
|---|---|---|---|---|---|
| Move | A / D | ← / → | G / J | Num 4 / 6 | Left stick / D-pad |
| Jump / double jump | W | ↑ | Y | Num 8 | A / Cross |
| Crouch / fast fall | S | ↓ | H | Num 5 | Stick / D-pad down |
| Punch / aerial | Z | I | B | Num 1 | X / Square |
| Special | X | O | N | Num 2 | B / Circle |
| Guard | C | P | M | Num 3 | RB / R1 |
| Signature / recovery | V | L | K | Num 0 | Y / Triangle |
| Dodge / air dash | Q | U | T | Num Decimal | LB / L1 |
| Pause / resume | Escape | Escape | Escape | Escape | Start / Options |

**Classic** preserves original movement and four disciplines. **Expanded** gives one extra jump, one air dash and one airborne Signature recovery before landing. Special remains the discipline ability in the air. Punch is forward aerial; Down + Punch is down-air. Down accelerates a fall. Landing/respawning replenishes air resources, which appear separately on the HUD. A battery pickup intentionally restores ability availability.

On the ground, crouch + Punch is uppercut; crouch + Special is sweep. The original direction → crouch → stand + Special sequence also triggers a signature when completed within half a second. Face the opponent to guard ordinary frontal punches. Specials, signatures, uppercuts and sweeps bypass that guard; blocked hits and exhausted guard have recovery.

Items and hazards are separate Expanded custom-match switches, both off by default. USB throws, cooling fans, firewall defense, batteries and temporary overclock have visible effects/durations. Deployables expire and can be destroyed; boards and printed blocks are limited to two per fighter.

## Independent controller setup

Additional controllers press A / Cross to join an available seat. Each controller edits its own fighter card and readiness. Keyboard users share arrows, Enter, Escape and Tab; names/codes need a physical keyboard. Appearance and Player/Controller tabs stay inside each card. The local coordinator manages bots and shared rules. Settings temporarily suspends fighter editing without discarding drafts.

Devices cannot silently take an occupied seat. Disconnect/reconnect preserves ownership and requires deliberate reclaim when necessary. Binding conflicts are shown rather than overwriting existing mappings. Default dodge mappings are added only without overriding saved controls. Menu confirm/back stay fixed when combat buttons are remapped. B/Escape closes one layer, and held buttons must release across transitions.

## Results, reconnects and free capacity

Stock uses last standing, with existing stock timeout ties. Timed KO counts KOs minus self-destructs. Hill earns uncontested zone time; Timed/Hill ties enter short sudden death. Royale gives one life, a shrinking safe zone and a four-minute limit; simultaneous eliminations share placement. Local Royale cameras frame surviving local fighters and show offscreen indicators, with a compact opponent roster.

Public pause opens your menu while the authority continues; inputs become neutral. A disconnected seat has fifteen seconds to return, then forfeits. An interrupted server restores its checkpoint or ends without a fabricated winner. Private hosts must remain active; the host resumes a shared pause with a countdown. A lost private host ends the round honestly.

If the free service is full, remain in the queue; daily capacity resets at the time shown. Limits are four active server matches, 64 lobby connections and 1,200 human-player-minutes per UTC day. There is no paid upgrade or silent fallback to a public browser host. Local/Solo remain available without the online service.

Physical controllers and separate-network playtesting are recorded separately from injected controller and synthetic-network verification. See [v2 verification](verification-v2.md).
