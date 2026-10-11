# Combat presentation polish

The renderer keeps the imported 60×96 layered sprites and every original appearance combination. Inspection of `body.png` confirmed that hurt contains a folded second pose, while jump, sweep and uppercut each have only one authored pose. Hurt now moves to its second pose after 120ms; specials and combos hold their first preparation pose until their authoritative 200ms activation, then use their existing active poses. Single authored poses remain intact rather than inventing motion that could misrepresent hit regions.

Nearby player names stack vertically to keep four-player scrums readable. Contact shadows follow the nearest platform below a fighter and become smaller/lighter with height. One world-space graphics object draws brief hit/block spokes, jump/landing dust and respawn/ring-out outlines. These are generated geometry, not replacement art. At most 24 bursts survive; all expire within 420ms. Existing imported projectile effects remain unchanged.

Gameplay event IDs and ticks suppress replay. The first snapshot, a new match, pause and resume seed event history rather than producing old impacts. Ground transitions are sampled once per new authoritative snapshot. Ring-out uses the prior observed position because authority can publish fall and respawn in the same snapshot. Presentation state belongs to the Phaser scene and dies on unmount. No simulation state, hitstop, camera impulses or collision dimensions change; the complete-arena camera anchoring remains intact.

Reduced motion disables burst travel and invulnerability flicker. Small static contact indicators still fade; there are no full-screen flashes or sprite transforms.

Verification: TypeScript and production build pass. Existing complete-app device flows pass Chromium, Firefox and WebKit (virtual controller input, not physical hardware). Additional actual-UI four-bot flows exercise each arena with full/reduced motion, resize, pause/resume and lobby/remount. QA captures live in ignored `tmp/qa/combat-*-*.png`. Native Arc verification is coordinated by the integration owner to avoid conflicting shared desktop input. No unit tests were added.
