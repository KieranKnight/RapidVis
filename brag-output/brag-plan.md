# RapidVis brag plan

**What it is:** A review tool for pre-vis shots. Export from Blender, review in a 3D viewer, make changes by typing commands, and send them back to Blender.
**For:** VFX and pre-vis artists and supervisors reviewing animated shots.
**What sets it apart:** Notes are typed commands (`retime cube 1.5`). Every note is a real, undoable change, and it goes back into Blender as one undo step.
**Best claim:** "Type the note. It's the change."
**Visual hook:** The logo *is* a terminal prompt (`>_` with a timeline key). The video opens on that prompt typing a real command.
**Real UI shown:** The running app (captured headlessly from the dev server): the empty state with the logo, the test shot playing through `shotCam`, real typing in the command bar with autocomplete, the Changes history, Compare, burn-in, and the Export dialog.
**Tone:** `default`, leaning polished. Clean, confident, a bit terminal-nerdy.
**Share caption:** "Pre-vis notes, typed. RapidVis turns review notes into commands and sends them straight back to Blender."

**Privacy:** Only the bundled test shot (`test_shot`: cube, shotCam, key_light, ground) appears. No personal data. The outro shows the public repo path `github.com/KieranKnight/RapidVis`; remove it if the repo is private.

## Identity

- Background `#1c1d21`, cards `#2a2c32`, text `#eceef2`, muted `#a5a9b2`, accent `#8fb3ff`, logo blue `#2f5bd3`, key orange `#ffd29a`.
- Type: JetBrains Mono (commands, logo) and Manrope (captions), from the app's own font files.

## Music

120 BPM (beat 0.5s, bar 2s), C major, progression Am–F–C–G, one chord per bar. Soft pad and pluck intro for the hook, then drums and bass drop at 4.0s with the reveal. A filtered-noise swell sits under each cut, and quiet key ticks (in the background) under the typing. It ends on a held C chord at 21s. Every cut lands on a beat.

## Storyboard (22s, as rendered)

The test shot looks poor through `shotCam` (mostly floor), so every app shot uses the free camera instead.

| # | Time | Scene | On screen | Sound |
|---|---|---|---|---|
| 1 | 0.0–4.0 | **Hook** | The app's command bar at 5× size types `retime cube 1.5` on 16ths (0.25–2.0s). A ✓ pops at 2.25, then "Pre-vis notes, typed." | Pad + arpeggio, soft ticks, bell on the ✓ |
| 2 | 4.0–7.0 | **Reveal** | The real app rises in as a window with the test shot *playing*. Caption: "Export from Blender. Review in RapidVis." | Drums and bass drop on 4.0 |
| 3 | 7.0–11.0 | **Highlight 1: type it** | Zoom (2.2×) into the real command bar: `retime cube 1.5` typed with the real autocomplete, submitted at 9.5, then zoom out to the ✓ and the new history row. Caption: "Type the note. It's the change." | Ticks on 16ths; bell on submit |
| 4 | 11.0–14.0 | **Highlight 2: history** | The Changes panel with three edits; a `C` key press at 12.5 cuts to the real Compare state (the cube jumps back). Caption: "Undo it. Mute it. Compare with the original." | Blip on the key press |
| 5 | 14.0–16.0 | **Highlight 3: movie** | `B`: the burn-in. `Ctrl E`: the real Export dialog, zoomed. Caption: "Review movie, burn-in on." | Blips on each key |
| 6a | 16.0–18.0 | **Punchline** | Dip to the background, then "Back into Blender. One undo." and `File › Import › RapidVis edits` | F chord |
| 6b | 18.0–22.0 | **Outro** | The real lockup, "Blender add-on + desktop app", and the repo path | Drums stop; a C chord resolves and rings out |

Transitions: soft slides and scales, staggered (old content out, then new in) or dipped through `#1c1d21`. No muddy crossfades between busy UIs.
