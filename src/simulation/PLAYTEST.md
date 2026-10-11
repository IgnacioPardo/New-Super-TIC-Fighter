# Classic integration playtest

Verified on 2026-10-11 against the complete React/Phaser application, its actual
simulation worker, and the integration assets. The production application was
built with `npm run build` and served with Vite preview. Isolated Playwright
Chromium 156.0.8078.4 on macOS supplied synthetic keyboard input through the UI.
Worker messages were observed with a browser `addInitScript` wrapper; no match
state, physics, or damage was injected. No unit or isolated simulation tests
were used.

| Complete application flow | Observed result |
| --- | --- |
| Practice with Normal and Easy on Classic, Laboratory, and Inside the PC; stationary human versus Code bot, 21 seconds per map and difficulty | Both difficulties navigated and attacked on all three maps, with zero bot falls in the final six runs. Human falls came from confirmed attacks; practice retained stocks and reset damage on respawn. |
| Move the human from PC's side platform to its centre and then its upper side platform using ordinary jumps | Normal followed and landed at heights 500, 350, and 200. The second human jump waited for the original 0.9-second jump cooldown. |
| Each of four disciplines versus a Dummy in practice; punch, uppercut, sweep, special, combo, and guard | All eleven distinct attacks and guard appeared in worker snapshots. Cable, mouse, ball, RAM, cables, selection, column, and disc effects appeared; special/combo screenshots showed them in the Phaser world. Dummy remained stationary. |
| Direction, crouch, then standing special within the combo window; combo shortcut pressed during the final 90 ms of punch recovery | The sequence selected combo; the buffered shortcut started combo when recovery ended. |
| Hold guard, then press direction and crouch | Facing, horizontal position, standing height, and guard posture remained fixed until release. |
| Two humans meet on PC's centre platform; frontal punch into guard, once in each direction | The victim gained 2%, moved to an 80-unit centre gap (60-unit body plus 20-unit gap), retained guard, and received no hit stun or vertical velocity. |
| Follow the guarded punch with a Networks special from the left and a Design special from the right | Both ignored guard and produced percentage increase, airborne hit reaction, and the 0.4-second protection timer. |
| Four Normal bots, four disciplines, 2v2, friendly fire disabled, one stock, one-minute limit | The full match reached team timeout results after 60 seconds; one fighter lost its stock and remained eliminated. Team 1 won with two remaining stocks versus one. The worker recorded 55 hits and no teammate hits. |
| Two humans, three stocks, one-minute limit, no movement | At 60 seconds the results showed a draw with three stocks each. |
| Rematch after results; pause during play for 700 ms; resume | New match identity, stocks/damage reset, and empty input acknowledgements during the opening countdown. Pause froze elapsed match time; resume restarted the three-second countdown. |

The final browser runs reported no uncaught page errors. Source guard push and
hit-reaction behavior were also checked against the reference table and the
read-only original collision branches. The fixes keep delayed opponent
observations and the same public input/physics rules for bots: they plan releases
for their own movement, retain jump destinations during ascent, avoid chasing
falling enemies off edges, and check sweep safety in the actual attack direction.

This record covers local keyboard/worker flows. It does not claim verification
of physical controllers, Safari, or multiplayer transport.
