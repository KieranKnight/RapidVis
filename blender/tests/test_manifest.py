from dataclasses import replace
from pathlib import Path

import pytest

from rapidvis_addon.manifest import CameraSensor, SceneInfo, build_manifest, manifest_path


def scene(**changes) -> SceneInfo:
    """The test shot from fixtures/, with any fields swapped out."""
    info = SceneInfo(
        blender_version="5.1",
        file_name="test_shot.blend",
        fps=24,
        fps_base=1.0,
        frame_start=1,
        frame_end=48,
        objects=["ground", "props", "cube", "shotCam", "key_light"],
        cameras={"shotCam": CameraSensor(width=36, height=24, fit="AUTO")},
    )
    return replace(info, **changes)


def test_describes_the_scene():
    manifest = build_manifest(scene())
    assert manifest["version"] == 1
    assert manifest["source"] == {"dcc": "blender", "version": "5.1", "file": "test_shot.blend"}
    assert (manifest["fps"], manifest["frameStart"], manifest["frameEnd"]) == (24, 1, 48)


def test_maps_every_node_to_its_object():
    assert build_manifest(scene())["nodes"]["shotCam"] == "shotCam"
    assert len(build_manifest(scene())["nodes"]) == 5


def test_includes_each_cameras_sensor():
    assert build_manifest(scene())["cameras"] == {
        "shotCam": {"sensorWidth": 36, "sensorHeight": 24, "sensorFit": "AUTO"}
    }


def test_works_out_fractional_frame_rates():
    assert build_manifest(scene(fps=24, fps_base=1.001))["fps"] == pytest.approx(23.976, abs=0.001)


def test_puts_the_manifest_next_to_the_glb():
    path = Path(manifest_path(str(Path("shots") / "sh010.glb")))
    assert path == Path("shots") / "sh010.manifest.json"
