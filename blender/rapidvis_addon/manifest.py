"""Builds the manigest that travels next to the .glb

Plain Python with no `bpy`, so it can be tested without Blende.
The viewer reads this file in `viewer/src/manifest.ts`
"""
import math
from dataclasses import dataclass, field
from pathlib import Path

MANIFEST_VERSION = 1

# One sampled value per frame, from frame_start to frame_end, for each property of each object:
# {"shotCam": {"lens": [35.0, 35.2, ...]}, "key_light": {"intensity": [...], "color": [[1, 1, 1], ...]}}
Curves = dict[str, dict[str, list]]

@dataclass(frozen=True)
class CameraSensor:
    width: float  # mm
    height: float  # mm
    fit: str  # 'AUTO', 'HORIZONTAL', 'VERTICAL', as blender names them


@dataclass(frozen=True)
class SceneInfo:
    """What the manifest needs to know about a scene, read out of Blender by export.py"""
    blender_version: str  # e.g '5.1'
    file_name: str  # e.g 'shot10.blend'
    fps: int
    fps_base: float  # Blender stores 23.976 fps as 24fps, fps_base=1.001
    frame_start: int
    frame_end: int
    objects: list[str] = field(default_factory=list)
    cameras: dict[str, CameraSensor] = field(default_factory=dict)
    curves: Curves = field(default_factory=dict)

def light_intensity(light_type: str, energy: float) -> float:
    """A light's power in glTF's units, converted the way the exporter's "Unitless" mode does:
    watts / 4π for point and spot lights, while a sun's strength is used as it is."""
    return energy if light_type == "SUN" else energy / (4 * math.pi)

def changing(curves: Curves) -> Curves:
    """Only the curves whose value actually changed. A value that holds still is already in the .glb"""
    result: Curves = {}
    for name, properties in curves.items():
        moving = {
            prop: values
            for prop, values in properties.items()
            if any(value != values[0] for value in values)
        }
        if moving:
            result[name] = moving
    return result

def build_manifest(info: SceneInfo) -> dict:
    return {
        "version": MANIFEST_VERSION,
        "source": {"dcc": "blender", "version": info.blender_version, "file": info.file_name},
        "fps": info.fps / info.fps_base,
        "frameStart": info.frame_start,
        "frameEnd": info.frame_end,
        # Blenders glTF exporter names each node after it's object
        "nodes": {name: name for name in info.objects},
        "cameras": {
            name: {"sensorWidth": sensor.width, "sensorHeight": sensor.height, "sensorFit": sensor.fit}
            for name, sensor in info.cameras.items()
        },
        # Lens and light animation, which the .glb leaves out
        "curves": changing(info.curves),
    }


def manifest_path(glb_path: str) -> str:
    """sh010.glb -> sh010.manifest.json, next to it, which is the name the viewer looks for first"""
    return str(Path(glb_path).with_suffix(".manifest.json"))
