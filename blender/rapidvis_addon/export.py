"""Export to RapidVis: writes the scene as a .glb, plus the manifest the viewer needs"""
import json
import subprocess

import bpy
from bpy.props import BoolProperty, StringProperty
from bpy_extras.io_utils import ExportHelper

from .launch import app_problem, launch_command
from .manifest import (
    CameraSensor,
    Curves,
    SceneInfo,
    build_manifest,
    light_intensity,
    manifest_path,
)
from .preferences import app_path


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


def data_values(obj: bpy.types.Object) -> dict:
    """The values a camera's or light's data that can be animated, in the manifest's units"""
    if obj.type == "CAMERA":
        return {"lens": round(obj.data.lens, 4)}
    light = obj.data
    return {
        "intensity": round(light_intensity(light.type, light.energy), 4),
        "color": [round(channel, 4) for channel in light.color],
    }


def sample_curves(scene: bpy.types.Scene) -> Curves:
    """Each animated camera's lens and light's power and colour, on every frame of the shot.
    These animate the object's *data*, which the glTF exporter (in real-keys mode) leaves out."""
    animated = [
        obj
        for obj in scene.objects
        if obj.type in {"CAMERA", "LIGHT"} and obj.data.animation_data and obj.data.animation_data.action
    ]
    curves: Curves = {obj.name: {} for obj in animated}
    if not animated:
        return curves

    current = scene.frame_current
    for frame in range(scene.frame_start, scene.frame_end + 1):
        scene.frame_set(frame)  # evaluates the animation on this frame
        for obj in animated:
            for prop, value in data_values(obj).items():
                curves[obj.name].setdefault(prop, []).append(value)
    scene.frame_set(current)  # leave the scene on the frame the artist was on
    return curves


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
        curves=sample_curves(scene),
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
       
    open_in_rapidvis: BoolProperty(
        name="Open in RapidVis",
        description="Open the exported shot in RapidVis straight away",
        default=True,
    )

    def execute(self, context):
        try:
            manifest = export_shot(context, self.filepath)
        except (RuntimeError, OSError) as error:  # the exporter failed, or the folder isn't writable
            self.report({"ERROR"}, f"RapidVis export failed: {error}")
            return {"CANCELLED"}
        exported = f"Exported {bpy.path.basename(self.filepath)} and {bpy.path.basename(manifest)}"
        problem = open_in_rapidvis(context, self.filepath) if self.open_in_rapidvis else None
        if problem:  # the export itself worked, so this is only a warning
            self.report({"WARNING"}, f"{exported}, but RapidVis didn't open. {problem}")
        else:
            self.report({"INFO"}, exported)
        return {"FINISHED"}


class RAPIDVIS_PT_panel(bpy.types.Panel):
    bl_label = "RapidVis"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"  # the sidebar (N)
    bl_category = "RapidVis"  # its tab name

    def draw(self, context):
        self.layout.operator(RAPIDVIS_OT_export.bl_idname, icon="EXPORT")
        self.layout.operator("rapidvis.apply_edits", icon="IMPORT")



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


def open_in_rapidvis(context: bpy.types.Context, glb_path: str) -> str | None:
    """Starts RapidVis on the shot, without waiting for it. Returns what went wrong, if anything."""
    app = app_path(context)
    problem = app_problem(app)
    if problem:
        return problem
    try:
        subprocess.Popen(launch_command(app, glb_path))  # Blender carries on while RapidVis runs
    except OSError as error:  # not a program, or not allowed to run
        return str(error)
    return None
