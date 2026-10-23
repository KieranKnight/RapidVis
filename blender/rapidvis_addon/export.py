"""Export to RapidVis: writes the scene as a .glb, plus the manifest the viewer needs"""
import json

import bpy
from bpy.props import StringProperty
from bpy_extras.io_utils import ExportHelper

from .manifest import CameraSensor, SceneInfo, build_manifest, manifest_path

# The glTF settings chosen
GLTF_SETTINGS = {
    "export_format": "GLB",
    "export_animations": True,
    "export_animation_mode": "ACTIVE_ACTIONS",  # one merged clip
    "export_force_sampling": False,  # Blender's real keys, not a sample on every frame
    "export_optimize_animation_size": False,
    "export_pointer_animation": False,  # three.js can't read KHR_animation_pointer
    "export_cameras": True,
    "export_lights": True,
    "export_extras": True,  # custom properties
    "export_yup": True,
    "export_import_convert_lighting_mode": "COMPAT",  # "Unitless": matches Blender's brightness
}

def scene_info(scene: bpy.types.Scene) -> SceneInfo:
    """Reads what the manifest needs out of a Blende scene"""
    major, minor, _patch = bpy.app.version
    return SceneInfo(
        blender_version=f"{major}.{minor}",
        file_name=bpy.path.basename(bpy.data.filepath) or "untitled.blend",
        fps=scene.render.fps,
        fps_base=scene.render.fps_base,
        frame_start=scene.frame_start,
        frame_end=scene.frame_end,
        objects=[obj.name for obj in scene.objects],
        cameras={
            obj.name: CameraSensor(obj.data.sensor_width, obj.data.sensor_height, obj.data.sensor_fit)
            for obj in scene.objects
            if obj.type == "CAMERA"
        },
    )


def export_shot(context: bpy.types.Context, glb_path: str) -> str:
    """Writes up the .glb and it's manifest next to it. Returns the manifests path"""
    bpy.ops.export_scene.gltf(filepath=glb_path, **GLTF_SETTINGS)
    path = manifest_path(glb_path)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(build_manifest(scene_info(context.scene)), file, indent=2)
    return path


class RAPIDVIS_OT_export(bpy.types.Operator, ExportHelper):
    """Export the scene for review in RapidVis (a .glb and its manifest)"""

    bl_idname = "rapidvis.export"
    bl_label = "Export to RapidVis"

    filename_ext = ".glb"  # ExportHelper adds this, and opens the file browser
    filter_glob: StringProperty(default="*.glb", options={"HIDDEN"})

    def execute(self, context):
        try:
            manifest = export_shot(context, self.filepath)
        except (RuntimeError, OSError) as error:  # the exporter failed, or the folder isn't writable
            self.report({"ERROR"}, f"RapidVis export failed: {error}")
            return {"CANCELLED"}
        self.report({"INFO"}, f"Exported {bpy.path.basename(self.filepath)} and {bpy.path.basename(manifest)}")
        return {"FINISHED"}



class RAPIDVIS_PT_panel(bpy.types.Panel):
    bl_label = "RapidVis"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"  # the sidebar (N)
    bl_category = "RapidVis"  # its tab name

    def draw(self, context):
        self.layout.operator(RAPIDVIS_OT_export.bl_idname, icon="EXPORT")


def menu_item(self, context):
    self.layout.operator(RAPIDVIS_OT_export.bl_idname, text="RapidVis (.glb + manifest)")


CLASSES = (RAPIDVIS_OT_export, RAPIDVIS_PT_panel)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.TOPBAR_MT_file_export.append(menu_item)  # File > Export


def unregister():
    bpy.types.TOPBAR_MT_file_export.remove(menu_item)
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)


