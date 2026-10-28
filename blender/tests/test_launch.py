import io
import os
import sys
import tarfile

import pytest

from rapidvis_addon.launch import (
    app_in,
    app_problem,
    bundled_archive,
    find_app,
    launch_command,
    unpack_viewer,
)


def make_bundle(addon_dir, version="1.0.0", files=None):
    """An add-on folder with a bundled viewer tar, like scripts/build.mjs makes."""
    files = files or {"RapidVis.exe": (b"exe", 0o755), "rapidvis": (b"elf", 0o755)}
    bundled = addon_dir / "bundled"
    bundled.mkdir(parents=True)
    archive = bundled / f"rapidvis-viewer-{version}.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        for name, (data, mode) in files.items():
            info = tarfile.TarInfo(f"./{name}")
            info.size = len(data)
            info.mode = mode
            tar.addfile(info, io.BytesIO(data))
    return str(archive)


def test_no_path_asks_for_one():
    assert "Preferences" in app_problem("")


def test_a_missing_app_is_named(tmp_path):
    missing = str(tmp_path / "RapidVis.exe")
    assert missing in app_problem(missing)


def test_an_existing_app_is_fine(tmp_path):
    app = tmp_path / "RapidVis.exe"
    app.write_bytes(b"")
    assert app_problem(str(app)) is None


def test_windows_runs_the_exe_with_the_shot():
    assert launch_command("C:/RapidVis/RapidVis.exe", "C:/shots/sh010.glb", "win32") == [
        "C:/RapidVis/RapidVis.exe",
        "C:/shots/sh010.glb",
    ]


def test_macos_opens_the_app_bundle():
    assert launch_command("/Applications/RapidVis.app", "/shots/sh010.glb", "darwin") == [
        "open", "-n", "/Applications/RapidVis.app", "--args", "/shots/sh010.glb",
    ]


def test_a_copy_from_source_has_no_bundled_viewer(tmp_path):
    assert bundled_archive(str(tmp_path)) is None


def test_the_bundled_viewer_is_found(tmp_path):
    archive = make_bundle(tmp_path)
    assert bundled_archive(str(tmp_path)) == archive


def test_each_system_has_its_own_app_name():
    assert app_in("v", "win32") == os.path.join("v", "RapidVis.exe")
    assert app_in("v", "darwin") == os.path.join("v", "RapidVis.app")
    assert app_in("v", "linux") == os.path.join("v", "rapidvis")


def test_unpacking_is_done_once_per_version(tmp_path):
    archive = make_bundle(tmp_path / "addon")
    user = tmp_path / "user"
    user.mkdir()
    folder = unpack_viewer(archive, str(user))
    assert os.path.basename(folder) == "rapidvis-viewer-1.0.0"
    (user / "rapidvis-viewer-1.0.0" / "marker").write_text("kept")
    assert unpack_viewer(archive, str(user)) == folder
    assert (user / "rapidvis-viewer-1.0.0" / "marker").exists()  # not unpacked again


def test_unpacking_a_new_version_removes_the_old_one(tmp_path):
    user = tmp_path / "user"
    (user / "rapidvis-viewer-0.9.0").mkdir(parents=True)
    unpack_viewer(make_bundle(tmp_path / "addon", "1.0.0"), str(user))
    assert sorted(os.listdir(user)) == ["rapidvis-viewer-1.0.0"]


@pytest.mark.skipif(sys.platform == "win32", reason="Windows has no execute permission to keep")
def test_unpacked_programs_can_still_run(tmp_path):
    user = tmp_path / "user"
    user.mkdir()
    folder = unpack_viewer(make_bundle(tmp_path / "addon"), str(user))
    assert os.access(os.path.join(folder, "rapidvis"), os.X_OK)


def test_a_path_in_the_preferences_wins(tmp_path):
    other = tmp_path / "Other.exe"
    other.write_bytes(b"")
    make_bundle(tmp_path / "addon")
    assert find_app(str(other), str(tmp_path / "addon"), str(tmp_path), "win32") == (str(other), None)


def test_the_bundled_viewer_is_used_when_no_path_is_set(tmp_path):
    make_bundle(tmp_path / "addon")
    user = tmp_path / "user"
    user.mkdir()
    app, problem = find_app("", str(tmp_path / "addon"), str(user), "win32")
    assert problem is None
    assert app == os.path.join(str(user), "rapidvis-viewer-1.0.0", "RapidVis.exe")


def test_no_bundle_and_no_path_says_what_to_do(tmp_path):
    app, problem = find_app("", str(tmp_path), str(tmp_path), "win32")
    assert app is None
    assert "release build" in problem and "Preferences" in problem


def test_a_bundle_for_another_system_is_named_as_such(tmp_path):
    make_bundle(tmp_path / "addon", files={"rapidvis": (b"elf", 0o755)})
    user = tmp_path / "user"
    user.mkdir()
    app, problem = find_app("", str(tmp_path / "addon"), str(user), "win32")
    assert app is None
    assert "isn't for this system" in problem
