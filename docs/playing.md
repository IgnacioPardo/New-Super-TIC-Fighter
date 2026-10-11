# Playing New Super TIC Fighter

Choose **Local** for two to four people on one computer, **Online** to create or join a shared room, or **Practice** for a bot or stationary training opponent. Each fighter chooses a discipline, hair, shirt, trousers, and a control device. Open **Jugador / Control** to change names, devices, bot difficulty, and team assignment. Everyone confirms readiness before the host starts an online round.

Online rooms also support two people on one computer and friends elsewhere. Assign different keyboard presets or controllers to the two local fighters; each remote browser assigns its own devices. Copy the invitation link from the room. There are no accounts or public matchmaking.

## Controls

| Action | Keyboard 1 | Keyboard 2 | Keyboard 3 | Keyboard 4 | Standard controller |
|---|---|---|---|---|---|
| Move | A / D | ← / → | G / J | Num 4 / 6 | Left stick / D-pad |
| Jump | W | ↑ | Y | Num 8 | A / Cross |
| Crouch | S | ↓ | H | Num 5 | Stick / D-pad down |
| Punch | Z | I | B | Num 1 | X / Square |
| Special | X | O | N | Num 2 | B / Circle |
| Guard | C | P | M | Num 3 | Right bumper |
| Combo | V | L | K | Num 0 | Y / Triangle |
| Pause | Escape | Escape | Escape | Escape | Start / Options |

Crouch plus punch gives an uppercut. Crouch plus special gives a sweep. The original direction → crouch → standing special sequence also triggers a combo when completed within half a second. Attacks have recovery time; most require standing on a platform. Face the opponent before holding guard; it locks your facing and blocks ordinary frontal punches. Other attacks bypass it.

Keyboard bindings and controller buttons/dead zone can be changed in Settings. Controllers navigate menus with the stick or D-pad, confirm with the mapped jump button, and go back with the mapped special button. A browser may need a click or key press to unlock sound.

## Rounds and reconnecting

Damage increases launch distance; falling below the arena spends one life. Three lives means three attempts. Last fighter or team standing wins. At timeout the remaining lives decide; equal totals draw. There are no side or top elimination zones.

Anyone can pause. The online host resumes with a three-second countdown. Keep the host's tab visible; hiding it pauses the round. A disconnected guest has 15 seconds to rejoin with the same browser tab's stored room credentials. The host can then resume. After the grace period, those fighters forfeit. A lost host ends the round without a winner; remaining players can return to a new lobby and start another round.

An unplugged controller pauses play and must be explicitly reclaimed. A different controller identifier cannot silently take that seat. Device/browser behavior varies; physical Xbox/PlayStation coverage is recorded separately in [verification](verification.md).

Direct connections usually avoid the relay detour. If direct connectivity fails, the game uses its free WebSocket relay. Actual latency depends on the players' networks. Local play and practice remain available when the room service is unavailable.
