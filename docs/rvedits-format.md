# The `.rvedits.json` format (version 1)

RapidVis saves the edits made to a shot as `<shot>.rvedits.json`. The edits are a list of commands, replayed on top of the original shot. The viewer reads this file back with **Load**, and the Blender add-on applies it to the real scene with **Apply RapidVis edits**.

```json
{
  "version": 1,
  "shot": "sh010",
  "source": { "dcc": "blender", "file": "sh010.blend" },
  "commands": [
    { "verb": "retime", "target": "cube", "factor": 2 },
    { "verb": "hide", "target": "ground", "muted": true },
    { "verb": "move-key", "target": "cube", "by": [0, 0, 1], "frame": 24 },
    { "verb": "focal", "target": "shotCam", "mm": 85 }
  ]
}
```

## Top level

| Field | Type | Meaning |
|---|---|---|
| `version` | number | Always `1` for this format. A reader must refuse versions it doesn't know. |
| `shot` | string | The shot's name: its `.glb` without the extension. Loading into a different shot is allowed, with a warning. |
| `source` | `{ dcc, file }` | Where the shot came from, from its manifest: e.g. `"blender"` and `"sh010.blend"`. Lets the DCC check it's applying the edits to the right file. |
| `commands` | array | The commands, oldest first. Apply them **in order**. |

## Commands

Each command is an object with a `verb`, plus that verb's fields. A command with `"muted": true` was switched off in the review: it's kept so the history loads back exactly as it was, but it **must not be applied**.

`target` is always the object's name **in the DCC** (the manifest's `nodes` map turns glTF node names into these). Transform values are in **Blender axes and units**: Z up, metres, degrees, and scale as a multiplier. Frames are scene frames.

| Verb | Fields | Meaning |
|---|---|---|
| `retime` | `target`, `factor` (> 0) | Plays the object's animation `factor`× faster than the original, pivoting on its first key. The latest retime of an object wins; `1` restores the original timing. Includes its lens and light animation. |
| `offset` | `target`, `frames` | Slides the object's animation by `frames` from the original timing. The latest wins; `0` puts it back. |
| `trim` | `start`, `end` (whole frames, `start < end`) | Sets the shot's frame range. The latest wins. |
| `move-all` / `rotate-all` / `scale-all` | `target`, `by: [x, y, z]` | An offset on every frame: metres, degrees, or a scale multiplier. The latest of each wins; `0 0 0` (`1 1 1` for scale) puts it back. In Blender: `delta_location`, `delta_rotation_euler`, `delta_scale`. Cameras and lights are never scaled. |
| `move-key` / `rotate-key` / `scale-key` | `target`, `by: [x, y, z]`, `frame` | Offsets the object's key on `frame`. If there's no key there, one is inserted on the existing curve first, then offset. |
| `hide` / `show` | `target` | Hides or shows the object **and everything parented to it**. |
| `intensity` | `target` (a light), `factor` (≥ 0) | Multiplies the light's original brightness (on every frame, if it's animated). The latest wins; `0` switches it off. |
| `color` | `target` (a light), `color` (`"#rrggbb"`, sRGB) | Sets the light's colour for the whole shot, as Blender's colour picker shows it (convert to linear for Blender's `light.color`). The latest wins. |
| `focal` | `target` (a camera), `mm` (> 0) | Sets the lens for the whole shot, replacing any lens animation. The latest wins. |

"The latest wins" means these commands are **absolute, not cumulative**: two `retime cube` commands don't multiply together; only the last one counts.

## Reading it safely

The viewer checks each command by turning it back into the text you'd type (`retime cube 2`) and running that through the same parser the command bar uses. A command that wouldn't be accepted if typed, such as an unknown verb, a bad value, or an object that isn't in the loaded shot, is skipped and reported, and the rest still load. Other readers should do the same: **report** commands they can't apply, never skip them silently.
