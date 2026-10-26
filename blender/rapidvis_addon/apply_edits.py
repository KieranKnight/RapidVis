"""Apply RapidVis edits: replays a .rvedits.json on the real scene, as one undo step."""
import json
import math

import bpy
from bpy.props import StringProperty
from bpy_extras import anim_utils
from bpy_extras.io_utils import ImportHelper

from .translate import (
    AddDelta,
    EditKey,
    Operation,
    ScaleTime,
    SetColor,
    SetHidden,
    SetIntensity,
    SetLens,
    SetRange,
    ShiftTime,
    translate
)

EDITS_VERSION = 1
DATA_PATHS = {"location": "location", "rotation": "rotation_euler", "scale": "scale"}


class EditError(Exception):
    """An operation that can't be done on this scene. It's reported, and the rest carries on"""


def channelbag(id_data):
    """Where an object's (or its data's) F-curves live in Blender 5's slotted actions, or None."""
    anim = id_data.animation_data if id_data else None
    if not anim or not anim.action:
        return None
    return anim_utils.action_get_channelbag_for_slot(anim.action, anim.action_slot)


def get_fcurves(id_data) -> list:
    """Every F-curve animating `id_data`: the one place F-curves are looked up."""
    bag = channelbag(id_data)
    return list(bag.fcurves) if bag else []


def object_fcurves(obj) -> list:
    """Every F-curve of an object and of its data (a camera's lens, a light's power)."""
    return get_fcurves(obj) + get_fcurves(obj.data)


def keyframes(obj) -> list:
    """Every key of an object and of its data."""
    return [key for fcurve in object_fcurves(obj) for key in fcurve.keyframe_points]


def move_keys_in_time(obj, new_frame) -> None:
    """Moves every key (and its handles) of an object and its data to `new_frame(old_frame)`."""
    for key in keyframes(obj):
        for point in (key.co, key.handle_left, key.handle_right):
            point.x = new_frame(point.x)
    for fcurve in object_fcurves(obj):
        fcurve.update()


class EditApplier:
    """Applies operations to one scene. Remembers each light's brightness before any edits."""

    def __init__(self, scene: bpy.types.Scene):
        self.scene = scene
        self.original_energy: dict[str, tuple[float, list[tuple[float, float, float]]]] = {}

    def find(self, name: str, kind: str | None = None):
        obj = self.scene.objects.get(name)
        if obj is None:
            raise EditError(f'No object named "{name}" in this scene')
        if kind and obj.type != kind:
            raise EditError(f'"{name}" is a {obj.type.lower()}, not a {kind.lower()}')
        return obj

    def apply(self, operation: Operation) -> None:
        match operation:
            case ScaleTime(target, ratio):
                obj = self.find(target)
                keys = keyframes(obj)
                if not keys:
                    raise EditError(f'"{target}" has no animation to retime')
                pivot = min(key.co.x for key in keys)  # its first key, like the viewer
                move_keys_in_time(obj, lambda frame: pivot + (frame - pivot) / ratio)
            case ShiftTime(target, frames):
                obj = self.find(target)
                if not keyframes(obj):
                    raise EditError(f'"{target}" has no animation to offset')
                move_keys_in_time(obj, lambda frame: frame + frames)
            case SetRange(start, end):
                self.scene.frame_start, self.scene.frame_end = start, end
            case AddDelta(target, prop, amount):
                self.add_delta(self.find(target), prop, amount)
            case EditKey(target, prop, frame, amount):
                self.edit_key(self.find(target), prop, frame, amount)
            case SetHidden(target, hidden):
                obj = self.find(target)
                for each in (obj, *obj.children_recursive):  # hiding a parent hides what it carries
                    each.hide_viewport = hidden
                    each.hide_render = hidden
            case SetIntensity(target, factor):
                self.set_intensity(self.find(target, "LIGHT"), factor)
            case SetColor(target, rgb):
                light = self.find(target, "LIGHT").data
                remove_fcurves(light, "color")  # a typed colour holds for the whole shot
                light.color = rgb
            case SetLens(target, mm):
                camera = self.find(target, "CAMERA").data
                remove_fcurves(camera, "lens")  # a typed lens holds for the whole shot
                camera.lens = mm

    def add_delta(self, obj, prop: str, amount) -> None:
        if prop == "location":
            obj.delta_location = [a + b for a, b in zip(obj.delta_location, amount)]
        elif prop == "rotation":
            obj.delta_rotation_euler = [
                a + math.radians(b) for a, b in zip(obj.delta_rotation_euler, amount)
            ]
        else:
            obj.delta_scale = [a * b for a, b in zip(obj.delta_scale, amount)]

    def edit_key(self, obj, prop: str, frame: float, amount) -> None:
        path = DATA_PATHS[prop]
        curves = {fc.array_index: fc for fc in get_fcurves(obj) if fc.data_path == path}
        if not curves:
            raise EditError(f'"{obj.name}" has no {prop} animation to key')
        unchanged = 1.0 if prop == "scale" else 0.0
        for axis, value in enumerate(amount):
            if value == unchanged:
                continue
            fcurve = curves.get(axis)
            if fcurve is None:  # this axis isn't keyed yet: key its still value first
                obj.keyframe_insert(path, index=axis, frame=frame)
                fcurve = next(fc for fc in get_fcurves(obj) if fc.data_path == path and fc.array_index == axis)
            key = next((k for k in fcurve.keyframe_points if abs(k.co.x - frame) < 1e-3), None)
            if key is None:  # no key on this frame: add one on the curve, so nothing moves yet
                key = fcurve.keyframe_points.insert(frame, fcurve.evaluate(frame))
            if prop == "scale":
                shift = key.co.y * value - key.co.y
            else:
                shift = math.radians(value) if prop == "rotation" else value
            for point in (key.co, key.handle_left, key.handle_right):
                point.y += shift
            fcurve.update()

    def set_intensity(self, obj, factor: float) -> None:
        light = obj.data
        energy_keys = [k for fc in get_fcurves(light) if fc.data_path == "energy" for k in fc.keyframe_points]
        # The first time this light is touched, remember its brightness, so every intensity is
        # a multiple of the original, like the viewer's (the latest wins; 1 puts it back)
        energy, keys = self.original_energy.setdefault(
            obj.name,
            (light.energy, [(k.co.y, k.handle_left.y, k.handle_right.y) for k in energy_keys]),
        )
        light.energy = energy * factor
        for key, (y, left, right) in zip(energy_keys, keys):
            key.co.y, key.handle_left.y, key.handle_right.y = y * factor, left * factor, right * factor


def remove_fcurves(id_data, data_path: str) -> None:
    bag = channelbag(id_data)
    if bag:
        for fcurve in [fc for fc in bag.fcurves if fc.data_path == data_path]:
            bag.fcurves.remove(fcurve)


def apply_edits(scene: bpy.types.Scene, edits: dict) -> tuple[int, list[str]]:
    """Applies a loaded .rvedits.json. Returns how many operations worked, and every problem."""
    if edits.get("version") != EDITS_VERSION or not isinstance(edits.get("commands"), list):
        return 0, ["This isn't a RapidVis edits file this add-on can read"]

    operations, problems = translate(edits["commands"])
    source = edits.get("source", {}).get("file")
    here = bpy.path.basename(bpy.data.filepath)
    if source and here and source != here:
        problems.insert(0, f'These edits were made on "{source}", not "{here}"')

    applier = EditApplier(scene)
    done = 0
    for operation in operations:
        try:
            applier.apply(operation)
            done += 1
        except EditError as error:
            problems.append(str(error))
    return done, problems


class RAPIDVIS_OT_apply_edits(bpy.types.Operator, ImportHelper):
    """Apply edits made in RapidVis (a .rvedits.json) to this scene, as one undo step"""

    bl_idname = "rapidvis.apply_edits"
    bl_label = "Apply RapidVis Edits"
    bl_options = {"REGISTER", "UNDO"}  # one Ctrl+Z takes the whole file back out

    filename_ext = ".json"
    filter_glob: StringProperty(default="*.rvedits.json", options={"HIDDEN"})

    def execute(self, context):
        try:
            with open(self.filepath, encoding="utf-8") as file:
                edits = json.load(file)
        except (OSError, json.JSONDecodeError) as error:
            self.report({"ERROR"}, f"Couldn't read the edits: {error}")
            return {"CANCELLED"}

        done, problems = apply_edits(context.scene, edits)
        for problem in problems:
            self.report({"WARNING"}, problem)
        summary = f"Applied {done} RapidVis edits"
        self.report({"WARNING"} if problems else {"INFO"}, summary + (f", with {len(problems)} problems" if problems else ""))
        return {"FINISHED"}


def menu_item(self, context):
    self.layout.operator(RAPIDVIS_OT_apply_edits.bl_idname, text="RapidVis edits (.rvedits.json)")


def register():
    bpy.utils.register_class(RAPIDVIS_OT_apply_edits)
    bpy.types.TOPBAR_MT_file_import.append(menu_item)  # File > Import


def unregister():
    bpy.types.TOPBAR_MT_file_import.remove(menu_item)
    bpy.utils.unregister_class(RAPIDVIS_OT_apply_edits)

    