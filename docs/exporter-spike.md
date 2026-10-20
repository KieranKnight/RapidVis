# Exporter Spike (Task 0): Blender 5.1 → glTF

Date: 2026-10-20 · Blender 5.1 · built-in glTF 2.0 exporter
Test scene: `fixtures/test_shot.blend` (built by `blender/scripts/make_test_shot.py`).
It has an animated cube (3 keys) under the empty `props`, an animated camera `shotCam` (2 location keys, plus lens animated from 35 to 50mm) and a point light `key_light`. Frames 1–48 at 24 fps.

## Exports compared

| | A: `test_shot_keys.glb` | B: `test_shot_scene.glb` |
|---|---|---|
| Animation Mode | Active actions merged | Scene |
| Always Sample Animations | off | on |
| Optimize Animation Size | off | default |
| Export Animation Pointer | off | on |
| Cube translation | **3 keys, CUBICSPLINE** (real keys) | 48 samples, LINEAR (baked) |
| Camera translation | **2 keys, CUBICSPLINE** | 48 samples, LINEAR |
| Camera focal length | **not exported** | 48 samples via `KHR_animation_pointer` → `/cameras/0/perspective/yfov` |
| glTF animations | 1 merged clip, `"Animation"` | 3 clips: `cube`, `shotCam`, `shotCam` (duplicate name) |
| Re-import into Blender | fine | the camera appears to lose its movement (most likely because of the duplicate-named clips; not investigated further) |

Shared settings: glTF Binary, Custom Properties ✅, Cameras ✅, Punctual Lights ✅, +Y Up ✅, Animations ✅.

**Lighting Mode must be "Unitless"** (found while doing Task 2). The default "Standard" mode converts watts to candela with ×683 lm/W (1000 W point → 54,351 cd). That's physically correct, but it needs camera exposure, so without it the viewer blows out to white. "Unitless" gives `W / 4π` (1000 W → 79.6), which matches Blender's own rendered brightness. The viewer uses `AgXToneMapping` to match Blender's default view transform.

**Meshes need materials.** glTF's default material is white and fully metallic, while Blender shows unassigned objects as grey diffuse. The test scene now assigns Principled BSDF materials (`make_material` in `make_test_shot.py`).

## Decision: export A ("real keys")

- It keeps Blender's actual keyframes, with Bezier handles carried as cubic-spline tangents. That's what `move-key`, `retime` and `offset` need so they behave the same in the viewer and in Blender.
- It gives one merged clip, which is simpler for the viewer.
- Export B isn't usable as-is: three.js's `GLTFLoader` doesn't support `KHR_animation_pointer` without a plugin, and the duplicate clip names are fragile.

**The gap:** camera and light property animation (lens, light energy, colour) isn't exported in mode A.
**Fallback (adopted):** `manifest.json` carries these as extra curves, sampled per frame, written by the add-on (Task 13). For Task 2 the fixture manifest is written by hand.

## Facts confirmed for later tasks

- **Axes:** Blender `(x, y, z)` → glTF `(x, z, -y)`. Example: the camera at Blender (-1, -10, 3) is at glTF (-1, 3, 10). (Task 9)
- **Time:** glTF time = `frame / fps`, so frame 1 = 0.041666 s. Converting back: `frame = time × fps`. No offset. (Task 3)
- **Focal → FOV:** `yfov` 0.5632 rad = 35mm lens, 36mm sensor, auto fit, 16:9 → vertical sensor = 36 / (16/9) = 20.25mm → `2·atan(20.25 / (2·35))`. (Task 10)
- **Camera rotation:** Blender's 75° X tilt exported as a −15° X quaternion. The exporter applies the 90° camera-axis correction itself, so the viewer must not add one.
- **Cubic-spline keys:** tangents are stored per second. When `retime` scales key times by `1/factor`, tangents must be scaled by `factor`. (Task 6)
- Interpolation: Blender Bezier → glTF `CUBICSPLINE`; three.js supports this natively.
