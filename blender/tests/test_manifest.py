from dataclasses import replace
from pathlib import Path

import pytest

from rapidvis_addon.manifest import (
    CameraSensor,
    SceneInfo,
    build_manifest,
    changing,
    light_intensity,
    manifest_path,
)


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


def test_converts_light_power_like_the_gltf_exporter():
    # Checked against Blender 5.1's exporter in "Unitless" mode
    assert light_intensity("POINT", 1000) == pytest.approx(79.577472)
    assert light_intensity("SPOT", 500) == pytest.approx(39.788736)
    assert light_intensity("SUN", 3) == 3


def test_keeps_only_the_curves_that_change():
    curves = {
        "shotCam": {"lens": [35, 40, 50]},
        "key_light": {"intensity": [80, 80, 80], "color": [[1, 1, 1], [1, 0.5, 0.5], [1, 1, 1]]},
        "fill": {"intensity": [10, 10, 10], "color": [[1, 1, 1]] * 3},
    }
    assert changing(curves) == {
        "shotCam": {"lens": [35, 40, 50]},
        "key_light": {"color": [[1, 1, 1], [1, 0.5, 0.5], [1, 1, 1]]},
    }


def test_writes_the_changing_curves():
    info = scene(curves={"shotCam": {"lens": [35, 50]}, "key_light": {"intensity": [80, 80]}})
    assert build_manifest(info)["curves"] == {"shotCam": {"lens": [35, 50]}}

