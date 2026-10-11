# Original archive: complete directory and asset audit

Audited 2026-10-11. Source root: `/Users/nacho/Downloads/STF_2017`, kept unchanged. File contents were treated as historical evidence, not instructions. This supplements `original-gameplay-reference.md`, which traces the complete `Game1.cs` behavior.

## Coverage and counts

The recursive pass covered every directory, including empty directories, and hashed every loose file. There are **1,875 files, 262 directories excluding the root, 119,403,882 bytes**, no hidden files, and no symlinks. File extensions were normalized case-insensitively; two PNG filenames use uppercase `.PNG`.

| Root branch | Files | Descendant directories, excluding branch itself | Bytes | Classification |
|---|---:|---:|---:|---|
| `Control` | 1 | 1 | 328,445 | Unrelated software archive; empty 3D design directory |
| `Diseño` | 587 | 40 | 7,304,200 | 576 PNGs, 8 PSD masters, 3 ZIP animation exports |
| `Programacion` | 1,276 | 211 | 110,208,388 | XNA source/content/build outputs and separate sound collection |
| `xdxd` | 11 | 6 | 1,562,849 | Separate early Unity 5.3.2f1 experiment and generated metadata |

Loose extensions: 1,066 PNG, 574 XNB, 156 MP3, 18 WAV, 8 WMA, 8 PSD, 7 TXT, 6 CS, 4 META, 4 CACHE, 3 ZIP, 2 SLN, 2 CSPROJ, 2 PDB, 2 EXE, 2 SPRITEFONT, and one each ACCDB, RAR, MAT, UNITY, SUO, USER, CACHEFILE, ICO, XML, CONTENTPROJ, and extensionless Unity asset database.

There are 1,288 distinct SHA-256 contents among the loose files. The remaining 587 copies are byte duplicates, principally design/runtime reuse and generated build copies. This count does not treat archives as expanded directories.

All PNG/PSD/icon files were decoded successfully for dimensions and format. All 489 runtime texture PNGs were visually reviewed in contact sheets; all 115 design PNG files not byte-identical to runtime textures, all eight PSD composites, and all 104 ZIP image members were also visually reviewed. PSD layer records were parsed separately. All 182 loose audio containers were probed successfully for codec, channels, sampling rate, duration and available tags. This audit does not claim an auditory identification of every song; soundtrack identity is a separate pass.

Every first-party source/configuration file outside `Game1.cs` was read. The binary Unity scene, material, and asset database were parsed without launching Unity. The Access database catalog, schema, indexes, and application rows were recovered without opening Access. All XNB headers/readers were classified and all 546 texture payloads decoded for comparison. All ZIP members were read and checked; the RAR member inventory was read, but its executable was not extracted or run. No old executable was run.

## Newly recovered material and what it means

The largest previously overlooked asset set is **104 smooth RAM growth frames** inside three design ZIPs. The Access database also preserves evidence of planned player profiles, cosmetics, preferred map and win/loss statistics. The separate `xdxd` directory is an early 3D movement experiment, not another playable version of Super TIC Fighter. No launcher, results application, menu screen artwork, additional finished stage, or alternate XNA game source was found anywhere in this archive.

### Hardware animation ZIPs

All three ZIPs are under `Diseño/Ataques/Hardware/atk spam harware`. They contain flat PNG sequences only, with no nested archives, scripts, documents, or executable members.

| ZIP | Members | Frame dimensions | Uncompressed bytes |
|---|---:|---|---:|
| `SPAm hard chico.zip` | `BAJO00.png`–`BAJO15.png`, 16 | 50×48 | 25,503 |
| `Spam hard mediano.zip` | `MEDIANO00.png`–`MEDIANO35.png`, 36 | 50×96 | 96,229 |
| `Spam hard grande.zip` | `GRANDE00.png`–`GRANDE51.png`, 52 | 50×128 | 184,879 |

Every member differs byte-for-byte from loose files. Visually these are individual upright RAM sticks growing from a thin line to full height. The shipped content instead has 15 `RAM0`–`RAM14` frames, using selected growth frames and composites of two/three RAM sticks (widths 50, 100, 150). The archives therefore contain useful additional animation source, not a new attack type.

### Design source versus runtime art

Of the 576 design PNGs, **461 are byte-identical to a runtime texture**; **469 have identical decoded RGBA pixels**. The remaining **107 differ in pixels or dimensions**. The difference between byte and pixel counts is metadata/encoding, not eight additional illustrations.

The completed visual identity is a digitized/pixel-treated human fighter in a red shirt and tan trousers, recolored through separate hair/shirt/trousers overlays. Colored clothing changes are independent; there are not four independently drawn character rosters. The 16 HUD portraits are hair/shirt combinations inside a hexagonal portrait frame with a horizontal label area.

| Design family | Findings relative to shipped content |
|---|---|
| `Ataques/Dsñ` | Ten pointer projectiles are reused. A 35-file final selection sequence and a separate 16-frame earlier selection-outline set preserve intermediate exports; runtime contains 22 selection frames. Earlier files include no-pointer variants. |
| `Ataques/Hardware` | A 60×60 disc source, a tall 50×205 RAM source, four reused 52×52 spinning-disc frames, and the ZIP growth sequences above. |
| `Ataques/Programacion` | Five separate 10×96 vertical code strings; runtime uses one combined 60×96 code-column image. Two earlier six-frame green 0/1 projectile sets (90×32 and approximately 72–74×32) and five PSD masters precede the six shipped 45×20 frames. |
| `Ataques/Redes` | Fifteen cable extension/retraction source frames differ from the runtime frames; the design sequences are still the same cable attack, not a separate weapon. The 18-frame ground-cable sequence has three intermediate frames outside the current 15-frame runtime PNG set. |
| `Fondos` | One **1156×768** industrial rooftop/city backdrop with clouds, distant buildings and steel trusses. It is not included in the XNA content project. Four loose platform files correspond to three runtime platform sizes (250, 500, 800 pixels wide, all 50 high); no second finished stage found. |
| `Logos` | Two 2277×1437 ORT CORP logo exports, including opaque/transparent background treatment, and a layered PSD. This is ORT CORP branding, not a missing Super TIC Fighter title menu. |
| `Otros` | A portrait PSD master plus the 16 reused HUD portrait exports. |
| `Sprites/Chona Final` | All 17 animation subdirectories were covered: crouch, sweep, walk, hardware combo, network combo, guard, punch, idle, hit reactions, generic raised-arm combo, jump, four discipline specials, uppercut, and `Para chonix` work-in-progress exports. Extra files include two earlier crouch poses/overlays, guard pose overlays, idle body/head/legs slices, three jump candidates, alternate cable-casting poses, and a different uppercut pose/overlays. They are revisions of the same fighter. |

Runtime frame collection by non-character family: design selection 22, pointer 10, hardware RAM 15, disc 4, programming code-column 1, green projectile 6, network ground cables 15, cable whip 15, platforms 3, portraits 16. The rest are fighter body and palette overlay frames. Directory names are inconsistent: for example, `Combo Diseno` contains filenames beginning `CProgramacion`. Runtime loading and mechanics, rather than the directory label alone, determine the animation's use.

### PSD masters

All eight PSDs parsed successfully. They add editable art structure, but no separate written design specification.

| File | Canvas | Layers and evidence |
|---|---|---|
| `Ataques/Dsñ/mouse.psd` | 99×32 | Nine visible layers: `Capa 0`, seven `Elipse 2`/copy trail layers, `Rectángulo 2 copia 5`; pointer and animated trail construction. |
| `Ataques/Programacion/atk spam programacion/Sin título-1.psd` | 90×32 | One visible `Capa 1`; green projectile. |
| `Sin título-2.psd` | 90×32 | Visible `Capa 1`, `Capa 2`; projectile and digit detail. |
| `Sin título-3.psd` | 90×32 | One visible `Capa 1`. |
| `Sin título-4.psd` | 90×32 | Visible `Capa 1`, `1`. |
| `Sin título-5.psd` | 90×32 | Visible `Capa 1`, `Capa 2`. |
| `Logos/Logo-ORT.psd` | 2277×1437 | Seven layers: hidden `Fondo`, visible `Fondo copia`, editable text `Corp` and `™`, visible `Capa 1`, hidden `Rectángulo 2` and `Rectángulo 1`. |
| `Otros/Retrato.psd` | 60×52 | One visible `Capa 1`; head inside hexagonal frame. |

## Data and the missing launcher/results boundary

`Super Tic FighterContent/Data/BaseDeDatos.accdb` is an ACE/Access database. Its application table is `Usuarios`; database header and row extraction both report **one record**. Catalog inspection found no application form, report, query, or module objects. Other tables are Access system/navigation/attachment metadata; one attachment is the standard `Tema de Office.thmx` theme.

| Column | Stored type | Sole saved value |
|---|---|---|
| `Nombre` | Text, primary key | `TomiSepa` |
| `Clave` | Text, separate index | Empty string |
| `PartidasGanadas` | 32-bit integer | 0 |
| `PartidasPerdidas` | 32-bit integer | 0 |
| `MapaPreferido` | Text | Null |
| `Pelo` | 32-bit integer | 1 |
| `Pantalon` | 32-bit integer | 1 |
| `Remera` | 32-bit integer | 1 |
| `Zapatos` | 32-bit integer | 1 |
| `Cuerpo` | 32-bit integer | 1 |

This is evidence of planned/past surrounding profile functionality, including shoes/body customization beyond the three runtime palette choices. It does **not** prove those features were implemented in this XNA executable. The database is excluded from the content build and the game source does not access it.

The parser initially failed while mapping a primary-key column identifier to an ordinal: `Nombre` has historical column ID 10 but ordinal 0. A temporary parser copy under `/tmp` was adjusted to allow row extraction; the index metadata was then checked explicitly and maps the primary key to column ID 10 (`Nombre`). The database itself was never modified.

The only runtime handoff text files are under `bin/x86/Debug/Content/Data`:

```text
infoPersonajes.txt:
4
30
1
0:0:0:1:TomiSepa
1:1:1:2:Chona
2:2:2:3:Ruy
3:3:3:4:Coni

Ganador.txt: Ruy:Coni
Perdedor.txt: TomiSepa:Chona
```

The first three configuration lines are player count, match seconds, and remaining respawns. Character rows are hair:shirt:trousers:discipline:name. The sample results show multi-name winner/loser records. Neither `Winner.exe` nor launcher source/executable exists in this archive. The two loose EXEs are byte-identical `Super Tic Fighter.exe` build copies, accompanied by matching PDBs.

## Project, generated outputs, and historical versions

The sole XNA solution targets .NET Framework 4 Client Profile, XNA 4 Windows Reach, x86, with Debug/Release configurations. Its four C# files are `Game1.cs`, the standard `Program.cs` entry point, assembly metadata, and `ReproductorMusica.cs`.

`ReproductorMusica.cs` is a separate incomplete threaded player: static stop flag begins true; its `Random` field is not initialized; it is not instantiated by `Game1.cs`. The actual game's soundtrack logic is in `Game1.cs`. The assembly copyright/company fields contain Visual Studio template defaults, not reliable asset ownership credits.

Both spritefont definitions request **Jing Jing**, regular, at 14 and 24 points, ASCII codepoints 32–126. No corresponding TTF/OTF font file is present in the 2017 tree.

The content project has **516 compile entries: 488 PNGs, 18 WAVs, 8 MP3s, 2 spritefonts**; all referenced input files exist. There are actually 489 texture PNGs: `Texturas/Jugadores/Cuerpos/CuerpoAgachado1.png` is an extra excluded file. The unused background and design-only assets are outside the content project. `GameThumbnail.png` is a separate application thumbnail.

The 574 XNBs comprise 546 textures, 18 sound effects, eight song descriptors and two spritefonts. All 516 expected build paths exist. The additional 58 XNBs are stale output under three mojibake/encoding variants of Diseño directories, older selection names and zero-padded cable names. Pixel comparison found **56 identical to current built textures**. The two remaining textures, `CABLES06.xnb` and `CABLES09.xnb`, match existing raw design PNGs exactly. Therefore these stale outputs contain no otherwise-lost unique artwork or second game version.

`bin`, `obj`, content-pipeline XML/cache manifests, `.suo`, reference caches, PDBs, and Unity `Library` material are generated/developer state. Their presence must not be mistaken for first-party feature source. No nested source release or second XNA `Game1.cs` was found.

## Audio inventory

There are **182 loose audio containers**: eight source MP3 songs, 18 source WAV effects, eight generated WMA song copies, and 148 separate MK1-named MP3 samples. All runtime sources are 44.1kHz stereo; WAV effects are signed 16-bit PCM. Generated WMA is wmav2. Probing found no malformed audio container.

Runtime effect names are `Barrida`, `Bola`, `Disco`, `Fight`, `Gancho`, `Golpe`, `Golpe2`, `Golpeado`, `Hard`, `Latigo`, `Mouse`, `Prog`, `Programacion`, `RAM`, `Redes`, `Seleccion`, `UTP`, `golpeMouse`. Durations range from approximately 0.287 to 1.176 seconds. Names indicate combat/start/special events; exact triggering comes from the gameplay reference.

| Song | Duration |
|---|---|
| `Cancion 0.mp3` | 3:25.244 |
| `Cancion 1.mp3` | 4:43.376 |
| `Cancion 2.mp3` | 4:29.270 |
| `Cancion 3.mp3` | 4:01.998 |
| `Cancion 4.mp3` | 3:34.047 |
| `Cancion 5.mp3` | 6:34.580 |
| `Cancion 6.mp3` | 3:43.242 |
| `Cancion 7.mp3` | 3:55.259 |

Available source-song metadata identifies encoders, not dependable title/artist credits. WMA build timestamps include November 2016; this shows parts of the archive predate 2017, not that the owner's project chronology is wrong.

Separate `Programacion/Super Tic Fighter/sonidos` collection: announcer 19, arenas 3, explosions 8, goro 13, hitsounds 39, johnnycage 1, liukang 13, male 40, musiccues 12. All 148 filenames start `mk1-`; no title/artist tags were found. These directory/file names are direct evidence of Mortal Kombat sample provenance, distinct from identifying every generic runtime sound or song by ear. No extra soundtrack/UI sound design document is present.

## `xdxd`: separate Unity experiment

Unity serialized files and project defines identify **5.3.2f1**. Script meta timestamps are from May 15, 2017. This predates the 2020 remake and has no multiplayer/game-room code.

- `Movimiento.cs`: empty `Start` and `Update` methods.
- `movEnemigo.cs`: translates along world Z at `velEnemigo * deltaTime * Direccion`, reversing direction beyond destination/origin.
- `ex de.unity`: five game objects—`Capsule`, `Cube`, `piso`, `Main Camera`, `Directional Light`; standard meshes/renderers/colliders. Capsule has the enemy script, speed 5, endpoints approximately −5.39 and 3.27; cube has a rigidbody and the empty movement script. No menus, sprites, combat, network transport or persistent player system found.
- `New Material 1.mat`: standard material with unassigned texture slots.
- `Library/assetDatabase3`: parsed as generated `AssetDatabaseV1`; not another scene or code archive.
- `ProjectSettings`, `obj`, `Library/ScriptAssemblies`, and `Library/metadata` are empty. The project is incomplete as a full standalone Unity checkout.

## `Control` and audit artifacts

`Control/Diseño 3D - Control` is empty. `Control/Keygen Rhino 5.12.rar` contains exactly one 381,440-byte `Keygen Rhino 5.12.exe`, with archive timestamp April 28, 2016. It is unrelated to game source/assets and was inventoried only. No executable was launched.

Detailed temporary audit evidence exists under `/tmp`: `stf2017-files.json` (hashes, dimensions, every path), `stf2017-audio.json`, `stf2017-users.json`, `stf2017-psds.json`, `stf2017-unity-experiment.json`, three ZIP member JSON reports, `stf2017-extra-xnb.json`, `stf2017-pixel-novel-design.json`, eight runtime texture contact sheets and five novel-design/archive contact sheets. Persistent complete file enumeration is also in the workspace's `source-inventory.json`.

Limitations: no historical executable was run; generated PDB/SUO/cache internals were classified rather than reverse-engineered into a second source tree; the unrelated RAR executable was only listed; metadata cannot establish unnamed soundtrack authorship. No source modifications or game implementation were made.
