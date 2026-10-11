# TIC Fighter: videogame UI direction

Research checked on 2026-10-11. This is a design brief for the existing React/Phaser implementation, not a change to gameplay scope. No new generated images or external artwork are needed.

## What the game should feel like

An industrial arcade cabinet built around the original blue/white/pink logo and layered, hand-cut fighter sprites. The title, selection, combat and result screens should each have one clear job. Original fighters and stage art carry the identity; hard edges, ink outlines, stage rails and bold type carry the UI. Avoid emoji icons, glass panels, decorative numbered sections and glow as the primary focus signal.

The current screen works functionally, but a persistent website header, marketing eyebrow labels, mode cards and repeated bordered form panels make it read as a dashboard. The small fighter previews and 29px damage numbers subordinate the most recognizable art and the most important combat information. This diagnosis is our design inference from the references below, not a claim made by their authors.

## Primary game references

| Source | Observed pattern | Application to STF |
| --- | --- | --- |
| [Rivals of Aether developer update](https://rivalsofaether.com/workshop-character-pack-release-date/) and its [official character selection screenshot](https://rivalsofaether.com/wp-content/uploads/2022/01/New-Css.jpg), viewed in Arc | Large art-led roster, stable colored player bays and one prominent Ready to Fight band. Rules and player settings are subordinate. | Four stable fighter bays with large original layered sprites, P1–P4 ribbons, discipline and appearance controls. A single full-width start band. We have four disciplines rather than a large roster, so do not reproduce its portrait grid. |
| [Nintendo's official Smash 3DS manual](https://csassets.nintendo.com/noaext/image/private/t_KA_PDF/manual-3DS-super-smash-bros-for-nintendo-3ds-en?_a=DATC1RAAZAA0), pages 25–30; [official gameplay basics](https://www.smashbros.com/en_US/howtoplay/basic.html) | The manual documents selection, stage selection, a battle screen with damage/lives/timer, and results. Damage is central to launch risk. | Large percentage readouts with portraits and stocks, fixed to the viewport outside the world camera. Timer centered at the top. Winner identity dominates the result screen. No health bars: they would misrepresent this game's percent/launch rules. |
| [TowerFall developer site](https://www.towerfall-game.com/) and [official King's Court screenshot](https://www.towerfall-game.com/newsite/images/screenshots/KingsCourt.png), viewed in Arc | The compact arena fills the image. Art and player silhouettes remain visible without surrounding product chrome. | Full-height battlefield, small pause control, compact metadata. TowerFall has different rules, so its minimal readouts do not justify hiding STF damage or lives. |
| [Mariel Cartwright, Powerful and Effective Animation for 2D Games](https://media.gdcvault.com/gdcchina14/presentations/833784_MarielCartwright_PowerfulAndEffective_EN.pdf), GDC presentation, especially silhouette/anticipation/key-pose/gameplay-first sections | Clear poses, silhouettes and timing communicate action. | Preserve the original cutout silhouettes and held attack poses. Keep UI and effects from covering fighters. This supports rendering clarity, not copying Skullgirls' health-bar layout or art. |

## Credible clarity guidance

- [Xbox Accessibility Guideline 101: text display](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101) and [102: contrast](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102): judge text at gameplay viewing distance and against the actual background. Essential names, labels and options must not use the previous 8–11px treatment. Strong ink outlines and opaque backing protect HUD contrast against all three stages.
- [Xbox Accessibility Guideline 112: UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112): predictable navigation aligned with visual structure, digital-input access, consistent select/back behavior and visible paths back. Maintain native text entry and select behavior; directional gamepad navigation moves focus spatially, with a visible outline and pointer. Do not make a mouse-only custom slider or swatch.
- [Game Accessibility Guidelines: indicate interactive elements](https://gameaccessibilityguidelines.com/give-a-clear-indication-that-interactive-elements-are-interactive/): controls need consistent visual signifiers. Focus/selection use outline, shape and text rather than color alone. Team A/B and stock counts retain explicit labels. Reduced motion remains supported.

## Verified AI skills

Discovery used the [skills.sh leaderboard](https://skills.sh/), `npx skills find game ui`, `game-design` and `frontend-design`; actual repository SKILL.md files and relevant references were read. Counts are a time-bound discovery signal, not a quality ranking. Repository stars count the whole repository, not this individual skill. No skills were installed.

| Skill | Verified source / discovery evidence | Fit and limits |
| --- | --- | --- |
| [game-ui-ux](https://skills.sh/gamedev-skills/awesome-gamedev-agent-skills/game-ui-ux) | [Actual SKILL.md](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/disciplines/game-ui-ux/SKILL.md), [layout and flow reference](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/disciplines/game-ui-ux/references/layout-and-flow.md). About 6.2K CLI installs; GitHub API: 1,404 repository stars. | Best supporting checklist: anchored HUD, aspect/safe-area policy, explicit focus, screen/modal flow, event-driven HUD updates and resolution/device checks. Its Godot/Unity examples do not directly implement React/Phaser. It is architecture guidance, not a visual style recipe. |
| [Anthropic frontend-design](https://skills.sh/anthropics/skills/frontend-design) | [Actual SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md). Site: 972.4K installs; GitHub API: 180,364 repository stars. | Best art-direction aid: ground the design in the subject's materials and vocabulary, deliberate typography/composition, avoid generic SaaS cards, unnecessary eyebrow labels and decorative numbering. Apply it to the game's real sprites and cabinet identity; do not substitute a marketing landing page. |
| [GitHub anti-ui-slop](https://skills.sh/github/awesome-copilot/anti-ui-slop) | [Actual SKILL.md](https://github.com/github/awesome-copilot/blob/main/skills/anti-ui-slop/SKILL.md), [audit playbook](https://github.com/github/awesome-copilot/blob/main/skills/anti-ui-slop/reference/audit.md). CLI: 847 installs; GitHub API: 39,891 repository stars. | Useful as a critique pass: task clarity, hierarchy, interaction states, focus and overflow. Its web/iOS catalogue and optional commercial MCP are not videogame expertise. Use the free written audit only; no paid service. |
| [design-taste-frontend](https://skills.sh/leonxlnx/taste-skill/design-taste-frontend) | Actual contents reviewed; site about 589.2K installs; GitHub API: 94,456 repository stars. | Not the main recommendation. It explicitly targets landing pages/portfolios/redesigns rather than multi-step product flows. Anti-default advice can be useful, but popularity does not make it a fighting-game UI guide. |

Recommendation: use game-ui-ux for navigation/layout verification and frontend-design for subject-specific composition, then compare the actual result to primary game screenshots. Skill prose alone cannot establish that a screen looks or plays well.

## Concrete screen redesign

### Title

A full-screen cabinet poster: original logo large, four original fighters staged underneath, a vertical text menu for Local / Online / Practice / Settings / Guide. Focus adds a hard pointer and solid white/blue rail. One compact bottom prompt explains navigation. Remove mode numbering, feature cards, marketing paragraphs and the persistent website toolbar. Language/audio/fullscreen remain reachable as small explicit controls.

### Player selection

P1–P4 remain in consistent left-to-right bays. Each shows a large original layered fighter, prominent player identifier, discipline picker, three four-option appearance rows and a clear ready state. Name, human/bot, difficulty, device and team controls remain fully available in each bay; compact disclosure groups avoid making the first impression a wall of forms. No settings or customization combinations are removed. Rules and arena selection use a horizontal strip beneath the bays. A full-width fight band carries the single start action and validation.

Online ownership rules, own-device validation, guest-owned customization, host rules, ready state, copy invite, connection state and accessible controls remain intact. No remote device duplicates may block local seats. Disabled host actions stay visible with their reason.

### Match

Phaser fills the playable viewport. HUD overlays are outside the world camera. Timer sits top-center; arena/mode are compact top-left; pause is top-right. Bottom player clusters use original portraits, player/name identity, 48–64px damage and visible stocks plus numeric life count. Names and values have opaque backing/ink outlines. Eliminated fighters visibly dim and retain zero lives. Team A/B is labeled and shaped. The HUD reserves a shallow safe area while avoiding the action; no global site header/footer is visible.

### Results

Large winner pose and player names, an unmistakable victory/draw/interrupted label, one primary rematch or return-to-room action and a compact secondary return action. Preserve honest interruption results (no arbitrary winner). Detailed remaining lives/damage are supporting information, not a dashboard table that competes with the winner. Use coded ribbons/triangles rather than emoji crowns.

## Verification gate

Type/build checks, real worker fights, settings persistence/remapping, keyboard focus, simulated gamepad menu commands (labeled as simulated), local results/rematch and online lobby/host/guest flows. Review actual screenshots at 1366×768 and a taller desktop aspect; small widths reflow rather than cut off controls. Check every arena behind the HUD, pause and loading/error states. Physical gamepad behavior is not claimed until actual hardware is exercised. No unit tests, image generation, paid services or external art ingestion.
