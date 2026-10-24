from rapidvis_addon.launch import app_problem, launch_command


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
