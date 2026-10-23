"""Exports a shot without opening Blender's window, for testing:

    blender -b --factory-startup fixtures/test_shot.blend --python blender/scripts/export_headless.py -- out/test_shot.glb

(--factory-startup skips your installed add-ons, so none of them can get in the way.)
"""
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # the `blender/` folder

from rapidvis_addon.export import export_shot  # noqa: E402 (Needs the path above first)

glb_path = str(Path(sys.argv[sys.argv.index("--") + 1]).resolve())  # Blender ignores args after "--"
manifest = export_shot(bpy.context, glb_path)
print(f"RapidVis: wrote {glb_path} and {manifest}")
