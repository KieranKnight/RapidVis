"""Builds the manigest that travels next to the .glb

Plain Python with no `bpy`, so it can be tested without Blende.
The viewer reads this file in `viewer/src/manifest.ts`
"""
from dataclasses import dataclass, field
from pathlib import Path

MANIFEST_VERSION = 1

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
    }


def manifest_path(glb_path: str) -> str:
    """sh010.glb -> sh010.manifest.json, next to it, which is the name the viewer looks for first"""
    return str(Path(glb_path).with_suffix(".manifest.json"))
