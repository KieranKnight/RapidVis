"""Starting RapidVis on an exported shot. Plain Python (no bpy), so pytest can check it."""

import os
import sys


def app_problem(app: str) -> str | None:
    """Why RapidVis can't be started from `app`, or None if it can."""
    if not app:
        return "Set where RapidVis is in Edit > Preferences > Add-ons > RapidVis to open shots in it"
    if not os.path.exists(app):
        return f'RapidVis isn\'t at "{app}": check the path in the add-on preferences'
    return None


def launch_command(app: str, shot: str, platform: str = sys.platform) -> list[str]:
    """The command that opens `shot` in RapidVis."""
    if platform == "darwin" and app.endswith(".app"):
        return ["open", "-n", app, "--args", shot]  # a macOS app is a folder: the system starts it
    return [app, shot]
