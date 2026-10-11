# Soundtrack and sound effects reference

This is an evidence record for the original and remake, not a decision to publish or replace any recording.

## Soundtrack identity and history

The Drive document contains a historical rock/metal song list with chiptune-channel references. It names Danger Zone, Welcome to the Jungle, Crazy Train, Chop Suey, Thunderstruck, Holy Wars, Du Hast, Master of Puppets, Robot Rock, Hot for Teacher, Rock Me Amadeus, Duke Nukem, Burn, Creeping Death, and Seek and Destroy. It has fifteen entries, while the final Unity repository has sixteen numbered music files. Filenames alone do not establish a title mapping.

`Lista OST.docx` was read structurally, rendered, and visually checked as a single page. It supplies eight YouTube links and no gameplay design, rights statement, or reliable filename-to-title table. The link parameters name 8BitUniverse and ChiptunePlanet for two references. The linked videos have not been independently checked in this audit.

The eight Drive WMA files carry exactly the same encoded ASF audio/data payloads as the matching original XNA build WMA files. Four bytes of container-header metadata differ. They are the original recordings carried forward.

The full Git history resolves the next step: at commit `163d3ca`, all eight `Assets/Music/Cancion N.mp3` files are byte-identical to the corresponding 2017 MP3 sources. Commit `cef9df0` on December 6, 2020 deleted them and introduced sixteen `CancionN.mp3` files. Its message describes downloading songs with Python and youtube_dl. The serialized Music Manager still points at the deleted recordings, so all eight playlist references at HEAD are dangling.

Local decoded-audio comparisons establish strong matching passages between original track 2 and remake track 15, and between original track 4 and remake track 3: three sampled eight-second passages correlate at approximately 0.97–0.98 after a constant alignment shift. Spectral comparisons suggest further relationships 0→1, 5→9, and 7→5; these are candidates, not verified title assignments or byte identity. No audio was uploaded to an external service. Measurements are saved in `audio-comparison.json` and `audio-matching-passages.json`.

## Playback design

The original loads eight songs, starts a music thread, sets volume to 0.6, disables single-song repeat, and chooses a random next song different from the previous one when playback stops or pauses. A Fight sound plays when content finishes loading. Other sound effects are tied to attacks and hit results; the detailed event mapping is in `original-gameplay-reference.md`.

The Unity remake has a separate approximately two-minute intro and a network-aware music manager intended to choose the same randomized playlist across players, avoiding repeats until the list is exhausted. Both its menu Audio Source and game Music Manager are inactive in the final saved scenes. The intro asset is present and referenced; the eight game playlist references are broken following the song replacement. Code existence is not evidence of audible final-build behavior.

The original runtime loads eighteen named WAV effects: Bola, Fight, Golpe, Golpe2, Golpeado, Hard, Latigo, RAM, Redes, UTP, Gancho, Mouse, golpeMouse, Prog, Barrida, Disco, Programacion, and Seleccion. The larger archived MP3 library includes named fighting-game character/hit/music-cue folders; those are source-library material, not all used in gameplay.

## Recording inventory

The original sources are 44.1 kHz stereo MP3; XNA-built and Drive versions are WMA v2. The final Unity playlist is 48 kHz stereo MP3. Intro is 44.1 kHz stereo MP3 with GarageBand encoder metadata. Available tags do not identify the numbered recordings' authors.

| Collection | File | Duration |
|---|---|---:|
| 2017 source | Cancion 0.mp3 | 3:25 |
| 2017 source | Cancion 1.mp3 | 4:43 |
| 2017 source | Cancion 2.mp3 | 4:29 |
| 2017 source | Cancion 3.mp3 | 4:02 |
| 2017 source | Cancion 4.mp3 | 3:34 |
| 2017 source | Cancion 5.mp3 | 6:35 |
| 2017 source | Cancion 6.mp3 | 3:43 |
| 2017 source | Cancion 7.mp3 | 3:55 |
| 2020 final playlist | Cancion0.mp3 | 3:19 |
| 2020 final playlist | Cancion1.mp3 | 3:27 |
| 2020 final playlist | Cancion2.mp3 | 4:37 |
| 2020 final playlist | Cancion3.mp3 | 3:34 |
| 2020 final playlist | Cancion4.mp3 | 6:08 |
| 2020 final playlist | Cancion5.mp3 | 3:56 |
| 2020 final playlist | Cancion6.mp3 | 4:40 |
| 2020 final playlist | Cancion7.mp3 | 8:27 |
| 2020 final playlist | Cancion8.mp3 | 3:41 |
| 2020 final playlist | Cancion9.mp3 | 6:34 |
| 2020 final playlist | Cancion10.mp3 | 6:38 |
| 2020 final playlist | Cancion11.mp3 | 6:53 |
| 2020 final playlist | Cancion12.mp3 | 2:41 |
| 2020 final playlist | Cancion13.mp3 | 3:07 |
| 2020 final playlist | Cancion14.mp3 | 4:53 |
| 2020 final playlist | Cancion15.mp3 | 4:29 |
| 2020 intro | intro.mp3 | 2:02 |

## What remains uncertain

The fifteen historical titles cannot responsibly be assigned to all sixteen final files from numbering or length alone. The exact finished intro/menu presentation was not executed in Unity. The owner has not yet decided whether the web version should retain these recordings or use fresh synthesized audio; this audit does not silently resolve that creative decision.
