"""Applies a .rvedits.json without opening Blender's window, for testing:

    blender -b --factory-startup fixtures/test_shot.blend --python blender/scripts/apply_headless.py -- edits.rvedits.json [out.glb]

With an out.glb, the edited scene is exported again, ready to compare in the viewer.
"""

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # the blender/ folder
from rapidvis_addon.apply_edits import apply_edits  # noqa: E402 (needs the path above first)
from rapidvis_addon.export import export_shot  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :]  # Blender ignores args after "--"
with open(args[0], encoding="utf-8") as file:
    done, problems = apply_edits(bpy.context.scene, json.load(file))
print(f"RapidVis: applied {done} edits")
for problem in problems:
    print(f"RapidVis: problem: {problem}")

if len(args) > 1:
    manifest = export_shot(bpy.context, str(Path(args[1]).resolve()))
    print(f"RapidVis: exported {args[1]} and {manifest}")
