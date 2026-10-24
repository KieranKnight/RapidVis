import pytest

from rapidvis_addon.translate import (
    AddDelta,
    EditKey,
    ScaleTime,
    SetColor,
    SetHidden,
    SetIntensity,
    SetLens,
    SetRange,
    ShiftTime,
    srgb_to_linear,
    translate,
)


def operations(*commands: dict) -> list:
    result, problems = translate(list(commands))
    assert problems == []
    return result


def test_retime_and_offset_become_changes_from_the_previous_one():
    assert operations(
        {"verb": "retime", "target": "cube", "factor": 2},
        {"verb": "retime", "target": "cube", "factor": 1},  # back to the original timing
        {"verb": "offset", "target": "cube", "frames": 5},
        {"verb": "offset", "target": "cube", "frames": 3},
    ) == [
        ScaleTime("cube", 2.0),
        ScaleTime("cube", 0.5),
        ShiftTime("cube", 5.0),
        ShiftTime("cube", -2.0),
    ]


def test_each_object_keeps_its_own_previous_value():
    assert operations(
        {"verb": "retime", "target": "cube", "factor": 2},
        {"verb": "retime", "target": "shotCam", "factor": 2},
    ) == [ScaleTime("cube", 2.0), ScaleTime("shotCam", 2.0)]


def test_whole_animation_moves_add_up_and_scales_multiply():
    assert operations(
        {"verb": "move-all", "target": "cube", "by": [1, 0, 0]},
        {"verb": "move-all", "target": "cube", "by": [3, 0, 2]},
        {"verb": "scale-all", "target": "cube", "by": [2, 2, 2]},
        {"verb": "scale-all", "target": "cube", "by": [4, 2, 1]},
    ) == [
        AddDelta("cube", "location", (1.0, 0.0, 0.0)),
        AddDelta("cube", "location", (2.0, 0.0, 2.0)),
        AddDelta("cube", "scale", (2.0, 2.0, 2.0)),
        AddDelta("cube", "scale", (2.0, 1.0, 0.5)),
    ]


def test_key_edits_only_follow_on_from_the_same_frame():
    assert operations(
        {"verb": "rotate-key", "target": "cube", "by": [0, 0, 30], "frame": 24},
        {"verb": "rotate-key", "target": "cube", "by": [0, 0, 10], "frame": 12},
        {"verb": "rotate-key", "target": "cube", "by": [0, 0, 45], "frame": 24},
    ) == [
        EditKey("cube", "rotation", 24.0, (0.0, 0.0, 30.0)),
        EditKey("cube", "rotation", 12.0, (0.0, 0.0, 10.0)),
        EditKey("cube", "rotation", 24.0, (0.0, 0.0, 15.0)),
    ]


def test_settings_and_visibility_are_absolute():
    assert operations(
        {"verb": "trim", "start": 5, "end": 40},
        {"verb": "hide", "target": "ground"},
        {"verb": "show", "target": "ground"},
        {"verb": "intensity", "target": "key_light", "factor": 0.5},
        {"verb": "focal", "target": "shotCam", "mm": 85},
    ) == [
        SetRange(5, 40),
        SetHidden("ground", True),
        SetHidden("ground", False),
        SetIntensity("key_light", 0.5),
        SetLens("shotCam", 85.0),
    ]


def test_colours_are_converted_to_blenders_linear_values():
    assert srgb_to_linear("#ffffff") == (1.0, 1.0, 1.0)
    assert srgb_to_linear("#000000") == (0.0, 0.0, 0.0)
    assert srgb_to_linear("#808080")[0] == pytest.approx(0.2158605)
    assert operations({"verb": "color", "target": "key_light", "color": "#ff0000"}) == [
        SetColor("key_light", (1.0, 0.0, 0.0))
    ]


def test_skips_muted_commands():
    assert operations({"verb": "hide", "target": "ground", "muted": True}) == []


def test_reports_commands_it_cannot_use():
    result, problems = translate(
        [
            {"verb": "explode", "target": "cube"},
            {"verb": "retime", "target": "cube"},  # no factor
            {"verb": "hide", "target": "ground"},
        ]
    )
    assert result == [SetHidden("ground", True)]
    assert problems[0] == "command 1: unknown command 'explode'"
    assert problems[1].startswith("command 2 (retime) couldn't be read")
