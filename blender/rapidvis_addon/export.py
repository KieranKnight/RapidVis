"""Export to RapidVis: writes the scene as a .glb, plus the manifest the viewer needs"""
import hashlib
import json
import os
import subprocess
import sys
from array import array
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass
from functools import partial

import bpy
import numpy
from bpy.props import BoolProperty, StringProperty
from bpy_extras.io_utils import ExportHelper

from .launch import find_app, launch_command
from .manifest import (
    CameraSensor,
    Curves,
    SceneInfo,
    build_manifest,
    light_intensity,
    manifest_path,
)
from .preferences import app_path, viewer_folder
from .render_helpers import PROCEDURAL_CUTOUT, SURFACE, VOLUME, is_left_out, looks_like_cards


# The glTF settings chosen
GLTF_SETTINGS = {
    "export_format": "GLB",
    "export_animations": True,
    "export_animation_mode": "ACTIVE_ACTIONS",  # one merged clip
    "export_force_sampling": False,  # Blender's real keys, not a sample on every frame
    "export_optimize_animation_size": False,
    "export_pointer_animation": False,  # three.js can't read KHR_animation_pointer
    "export_apply": True,  # modifiers (geometry nodes, subdivision...): the shapes as Blender shows them
    "export_gpu_instances": True,  # copies of one mesh under an empty: one EXT_mesh_gpu_instancing node
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


def upstream(socket: bpy.types.NodeSocket) -> list[bpy.types.Node]:
    """Every node feeding `socket`, including everything inside the node groups on the way."""
    found, seen = [], set()
    stack = [link.from_node for link in socket.links]
    while stack:
        node = stack.pop()
        if node.as_pointer() in seen:
            continue
        seen.add(node.as_pointer())
        found.append(node)
        if node.bl_idname == "ShaderNodeGroup" and node.node_tree:
            stack.extend(node.node_tree.nodes)
        stack.extend(link.from_node for input in node.inputs for link in input.links)
    return found


def fed_by(socket: bpy.types.NodeSocket, kind: str) -> bool:
    """Whether `socket` comes straight from a node of this kind (past any reroutes)."""
    node = socket.links[0].from_node if socket.links else None
    while node is not None and node.bl_idname == "NodeReroute":
        node = node.inputs[0].links[0].from_node if node.inputs[0].links else None
    return node is not None and node.bl_idname == kind


TRANSPARENT = "ShaderNodeBsdfTransparent"
UNLIT = ("ShaderNodeEmission", "ShaderNodeBackground")


def material_kind(material: bpy.types.Material | None) -> str | None:
    """SURFACE, VOLUME or PROCEDURAL_CUTOUT (see render_helpers.py), or None for an empty slot.

    A cutout is a Transparent BSDF mixed in by a factor that changes across the surface. The glTF
    exporter only carries that for an unlit material (Emission or Background) whose factor is
    straight from an image; anything else comes out solid, the cutout's card a block."""
    if material is None:
        return None
    output = material.node_tree.get_output_node("ALL") if material.node_tree else None
    if output is None:
        return SURFACE
    surface = output.inputs["Surface"]
    if not surface.is_linked:
        return VOLUME if output.inputs["Volume"].is_linked else SURFACE
    for node in upstream(surface):
        if node.bl_idname != "ShaderNodeMixShader":
            continue
        factor, first, second = node.inputs[0], node.inputs[1], node.inputs[2]
        if not factor.is_linked or not (fed_by(first, TRANSPARENT) or fed_by(second, TRANSPARENT)):
            continue  # an even mix, or no transparency
        other = second if fed_by(first, TRANSPARENT) else first
        carried = fed_by(factor, "ShaderNodeTexImage") and any(fed_by(other, kind) for kind in UNLIT)
        if not carried:
            return PROCEDURAL_CUTOUT
    return SURFACE


def open_edges(mesh: bpy.types.Mesh) -> int:
    """How many of the mesh's edges only one face uses."""
    if not mesh.loops:
        return 0
    edge_of_each_corner = numpy.empty(len(mesh.loops), dtype=numpy.int32)
    mesh.loops.foreach_get("edge_index", edge_of_each_corner)
    faces_per_edge = numpy.bincount(edge_of_each_corner, minlength=len(mesh.edges))
    return int(numpy.count_nonzero(faces_per_edge == 1))


def cannot_show(mesh: bpy.types.Mesh, materials, seen_by_camera: bool = True) -> bool:
    """Whether RapidVis leaves this mesh out (see render_helpers.py)."""
    kinds = [kind for kind in map(material_kind, materials) if kind is not None]
    if seen_by_camera and (not kinds or SURFACE in kinds):
        return False  # the usual case: no need to look at the geometry
    return is_left_out(seen_by_camera, kinds, looks_like_cards(open_edges(mesh), len(mesh.edges)))


def left_out_in(context: bpy.types.Context) -> list[bpy.types.Object]:
    """The meshes in the scene RapidVis can't show as they render. Judged on their evaluated mesh,
    since geometry nodes often make the cards."""
    depsgraph = context.evaluated_depsgraph_get()
    return [
        obj
        for obj in context.scene.objects
        if obj.type == "MESH"
        and cannot_show(
            obj.evaluated_get(depsgraph).data,
            [slot.material for slot in obj.material_slots],
            obj.visible_camera,
        )
    ]


class LeaveOut:
    """glTF exporter hooks for what RapidVis leaves out: some objects' meshes, and overlays."""

    def __init__(self, objects: set[str], overlays: set[str]):
        self.objects = objects
        self.overlays = overlays

    def gather_node_mesh_hook(self, hook, blender_object, export_settings):
        if blender_object.name in self.objects:
            hook.export_mesh = False

    def gather_mesh_hook(self, mesh, blender_data, blender_object, vertex_groups, modifiers, materials, export_settings):
        """In a mesh with a real surface, the see-through layers painted on it (brush strokes,
        decals) are overlays, which glTF would draw as solid shards: they go. A mesh made only of
        see-through parts is left whole: is_left_out decides about those."""
        kept = [p for p in mesh.primitives if not (p.material and p.material.name in self.overlays)]
        if kept:
            mesh.primitives = kept


@contextmanager
def leaving_out(objects: list[bpy.types.Object], overlays: set[str]):
    """While exporting, these objects keep their place in the hierarchy and their animation, but
    not their mesh; and meshes lose their overlays (see LeaveOut). Nothing in Blender is touched:
    other objects can be built from these (kelp grown along a hidden guide mesh, say). The glTF
    exporter looks for hooks on enabled add-ons' modules, so these sit on the exporter's own
    module, for this export only."""
    exporter = sys.modules["io_scene_gltf2"]
    before = getattr(exporter, "glTF2ExportUserExtensions", None)
    names = {obj.name for obj in objects}
    exporter.glTF2ExportUserExtensions = [*(before or []), partial(LeaveOut, names, overlays)]
    try:
        yield
    finally:
        if before is None:
            del exporter.glTF2ExportUserExtensions
        else:
            exporter.glTF2ExportUserExtensions = before


def shape_id(mesh: bpy.types.Mesh) -> str:
    """The same for any two meshes with the same points, faces and materials, wherever they came from."""
    points = array("f", [0.0]) * (len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", points)
    rest = repr((len(mesh.polygons), len(mesh.loops), [m.name if m else "" for m in mesh.materials]))
    return hashlib.blake2b(points.tobytes() + rest.encode(), digest_size=16).hexdigest()


@contextmanager
def instances_as_objects(context: bpy.types.Context, skip: set[str]):
    """While exporting, the instances geometry nodes scatter (kelp, coral, debris) are real objects.

    The glTF exporter's own option for them (export_gn_mesh) crashes on animated scenes: it keeps
    the instances' temporary meshes, which Blender frees as it steps through the frames. So each
    instance becomes an object, under a hidden empty in its instancer (so it moves with it), sharing
    one mesh per distinct shape; export_gpu_instances then writes each shape's copies as a single
    instanced node. Everything made here is removed afterwards. Instances that geometry nodes
    animate themselves are exported where they are on the current frame.

    Shapes RapidVis can't show (see render_helpers.py) are left out; this yields how many
    instances were, by instancer.
    """
    depsgraph = context.evaluated_depsgraph_get()
    meshes: dict[str, bpy.types.Mesh] = {}  # shape id -> its mesh, made once
    ids_by_pointer: dict[int, str | None] = {}  # each temporary mesh is read once; None: left out
    left_out: Counter[str] = Counter()
    placements: list[tuple[bpy.types.Object, str, object]] = []  # instancer, shape, where
    collection = None
    try:
        # First read every instance (their meshes only live while the depsgraph is walked)
        for instance in depsgraph.object_instances:
            if not instance.is_instance or instance.parent is None:
                continue
            instancer = instance.parent.original
            source = instance.object
            if (
                instancer.name in skip
                or instancer.instance_type == "COLLECTION"  # the exporter writes collection instances itself
                or source.type not in {"MESH", "CURVE"}
                or source.data is None
            ):
                continue
            pointer = source.data.as_pointer()
            if pointer not in ids_by_pointer:
                if source.type == "MESH" and cannot_show(source.data, source.data.materials):
                    ids_by_pointer[pointer] = None
                else:
                    shape = shape_id(source.data) if source.type == "MESH" else f"curve-{pointer}"
                    ids_by_pointer[pointer] = shape
                    if shape not in meshes:
                        meshes[shape] = bpy.data.meshes.new_from_object(source)
            if ids_by_pointer[pointer] is None:
                left_out[instancer.name] += 1
                continue
            placements.append((instancer, ids_by_pointer[pointer], instance.matrix_world.copy()))

        # Then build them: a hidden holder empty per instancer, at the world origin while it's still
        collection = bpy.data.collections.new("RapidVis export instances")
        context.scene.collection.children.link(collection)
        holders: dict[str, bpy.types.Object] = {}
        for instancer, shape, matrix in placements:
            holder = holders.get(instancer.name)
            if holder is None:
                holder = holders[instancer.name] = bpy.data.objects.new(f"{instancer.name}-instances", None)
                holder["rvInternal"] = True  # the viewer renders it, but leaves it out of the scene list
                collection.objects.link(holder)
                holder.parent = instancer
                holder.matrix_parent_inverse = instancer.matrix_world.inverted()
            obj = bpy.data.objects.new(f"{instancer.name}-instance", meshes[shape])
            collection.objects.link(obj)
            obj.parent = holder
            obj.matrix_basis = matrix  # the holder sits at the world origin, so local is world
        yield left_out
    finally:
        if collection is not None:
            for obj in list(collection.objects):
                bpy.data.objects.remove(obj)
            bpy.data.collections.remove(collection)
        for mesh in meshes.values():
            bpy.data.meshes.remove(mesh)


@dataclass
class Exported:
    manifest: str  # its path, next to the .glb
    left_out: list[str]  # the objects RapidVis can't show, e.g. "ENV-volume-underwater"
    left_out_instances: int  # and how many geometry nodes instances (brush strokes, particles...)

    def summary(self) -> str:
        """e.g. "10 objects and 4940 instances RapidVis can't show", or "" when nothing was left out."""
        parts = [f"{len(self.left_out)} objects"] if self.left_out else []
        parts += [f"{self.left_out_instances} instances"] if self.left_out_instances else []
        return f"{' and '.join(parts)} RapidVis can't show" if parts else ""


def export_shot(context: bpy.types.Context, glb_path: str) -> Exported:
    """Writes up the .glb and it's manifest next to it"""
    objects = left_out_in(context)
    overlays = {m.name for m in bpy.data.materials if material_kind(m) == PROCEDURAL_CUTOUT}
    with (
        instances_as_objects(context, skip={obj.name for obj in objects}) as instances,
        leaving_out(objects, overlays),
    ):
        bpy.ops.export_scene.gltf(filepath=glb_path, **GLTF_SETTINGS)
    path = manifest_path(glb_path)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(build_manifest(scene_info(context.scene)), file, indent=2)
    return Exported(path, sorted(obj.name for obj in objects), sum(instances.values()))


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
            result = export_shot(context, self.filepath)
        except (RuntimeError, OSError) as error:  # the exporter failed, or the folder isn't writable
            self.report({"ERROR"}, f"RapidVis export failed: {error}")
            return {"CANCELLED"}
        exported = f"Exported {bpy.path.basename(self.filepath)} and {bpy.path.basename(result.manifest)}"
        if result.summary():
            exported += f". Left out {result.summary()}"
            if result.left_out:
                print("RapidVis left out:", ", ".join(result.left_out))  # the full list, for the curious
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
    # The first time, this unpacks the bundled viewer: a few seconds, once per version
    app, problem = find_app(app_path(context), os.path.dirname(__file__), viewer_folder())
    if problem:
        return problem
    try:
        subprocess.Popen(launch_command(app, glb_path))  # Blender carries on while RapidVis runs
    except OSError as error:  # not a program, or not allowed to run
        return str(error)
    return None
