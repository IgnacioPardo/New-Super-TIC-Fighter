# Remake history reference

The full remote history was fetched into the temporary audit clone. It contains 73 commits, one remote main branch, and no tags. Historical sources remain unchanged. This review examines code and serialized scene evidence; no Unity build was run.

## Development progression

| Period | Evidence |
|---|---|
| November 24, 2020 | Unity project and player prefab; an initially included Mirror dependency was replaced by MLAPI. Removed Mirror code is third-party framework material, not an undiscovered STF mode. |
| November 27–29 | Movement, crouch/collider fixes, discipline special scripts, sprite animation work, splash screen and online menu. |
| November 30 | Host/client connection via GUI, persistent network manager, synchronized player names, crouch, and movement fixes. |
| December 1–4 | Attack prefab and hit detection, networked knockback, stock/respawn synchronization, and UI text. This supports the owner's account of an online prototype; it does not establish a complete finished match flow. |
| December 5 | Custom STFAnimator and modular-sprite integration, plus network-aware music selection. Several animator/state and customization paths remained unfinished. |
| December 6 | Original eight songs replaced by sixteen newly downloaded numbered songs; playlist scene references were not updated. |
| December 7 | Dynamic following camera introduced; later disabled by the commit titled Back a few steps. Final HUD edit introduced visible C# syntax/scope errors. |

## Specific historical findings

- `0168c24` implements GUI host/client scene entry on November 30.
- `9d91023` adds networked respawn and lives on December 3.
- `1eeabc5` revises hitbox/hit-detection networking on December 4.
- `b218a8b` adjusts hitbox TTL and moves Respawn into Scripts. Its use of local-player ownership for a hitbox and destruction of the component do not establish robust projectile lifetime behavior.
- Sampled source snapshots from November 30 through HEAD do not show a completed ordinary-punch spawn path: the older Attack.cs has its animation call commented out, and the later one only changes animator state. Discipline special instantiation is present. Do not infer a complete punch implementation from commit titles alone.
- `82d5f2d` replaces the older idle/crouch/block/basic-attack AnimatorController setup with custom STFAnimator work. Old animation assets were removed; they were not additional fighter content.
- At `163d3ca`, all eight Unity `Cancion N.mp3` assets are byte-identical to the 2017 MP3 sources.
- `cef9df0` deletes those eight music assets and adds sixteen `CancionN.mp3` files. There is no corresponding game scene update in that commit.
- `8ddf1d4` adds FollowPlayers and activates the FollowPlayer scene object. It centers and zooms to tagged players, using fixed four-slot arrays and a minimum camera size of 3.
- `007a8ed` explicitly changes FollowPlayer's scene active flag from 1 to 0. Therefore the camera is a concrete implemented improvement whose final scene activation was reverted.
- `fe16da3` introduces the invalid `or` expressions and branch-scoped HUD string declarations seen at HEAD. These are last-commit regressions, not evidence that no earlier demo could have worked.

## Implication for the port

Use the original as the detailed combat reference. Preserve the remake's online-game direction, visual presentation, HUD/name work, automatic-camera idea, and playlist idea, while completing and testing their integration. Do not treat the last saved scene as the full intended design, or assume every historical commit message corresponds to a working end-to-end feature.
