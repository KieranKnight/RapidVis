"""Finding and starting RapidVis. Plain Python (no bpy), so pytest can check it.

A release of the add-on carries the viewer inside it, as bundled/rapidvis-viewer-<version>.tar.gz
(see scripts/build.mjs). It's a tar because Blender installs add-ons with a zip extractor that
drops the permissions and links the macOS and Linux apps need to run. The first time a shot is
opened, the tar is unpacked into the add-on's own user folder, once per version.
"""

import os
import shutil
import sys
import tarfile

BUNDLED_PREFIX = "rapidvis-viewer-"
BUNDLED_SUFFIX = ".tar.gz"


def app_problem(app: str) -> str | None:
    """Why RapidVis can't be started from `app`, or None if it can."""
    if not app:
        return "Set where RapidVis is in Edit > Preferences > Add-ons > RapidVis to open shots in it"
    if not os.path.exists(app):
        return f'RapidVis isn\'t at "{app}": check the path in the add-on preferences'
    return None


def bundled_archive(addon_dir: str) -> str | None:
    """The viewer that came with the add-on, or None (a copy run straight from the source has none)."""
    folder = os.path.join(addon_dir, "bundled")
    if not os.path.isdir(folder):
        return None
    names = [n for n in os.listdir(folder) if n.startswith(BUNDLED_PREFIX) and n.endswith(BUNDLED_SUFFIX)]
    return os.path.join(folder, names[0]) if names else None  # a build carries exactly one


def app_in(folder: str, platform: str = sys.platform) -> str:
    """Where the app is in an unpacked viewer, by the names scripts/build.mjs gives it."""
    if platform == "win32":
        return os.path.join(folder, "RapidVis.exe")
    if platform == "darwin":
        return os.path.join(folder, "RapidVis.app")
    return os.path.join(folder, "rapidvis")


def unpack_viewer(archive: str, user_dir: str) -> str:
    """Unpacks the bundled viewer into `user_dir` (unless that version already is), and returns its
    folder. Folders of other versions are removed: each is a whole copy of the app."""
    name = os.path.basename(archive)[: -len(BUNDLED_SUFFIX)]
    target = os.path.join(user_dir, name)
    if not os.path.isdir(target):
        partial = target + ".partial"  # renamed into place only once it's all there
        shutil.rmtree(partial, ignore_errors=True)
        with tarfile.open(archive, "r:gz") as tar:
            tar.extractall(partial, filter="data")  # keeps programs runnable; refuses paths outside
        os.replace(partial, target)
    for other in os.listdir(user_dir):
        if other != name and other.startswith(BUNDLED_PREFIX):
            shutil.rmtree(os.path.join(user_dir, other), ignore_errors=True)
    return target


def find_app(
    preferred: str, addon_dir: str, user_dir: str, platform: str = sys.platform
) -> tuple[str | None, str | None]:
    """The app to open shots in, or why there isn't one. A path set in the preferences wins;
    otherwise it's the viewer bundled with the add-on."""
    if preferred:
        problem = app_problem(preferred)
        return (None, problem) if problem else (preferred, None)

    archive = bundled_archive(addon_dir)
    if archive is None:
        return None, (
            "This copy of the add-on has no viewer bundled: install a release build, or set where "
            "RapidVis is in Edit > Preferences > Add-ons > RapidVis"
        )
    try:
        app = app_in(unpack_viewer(archive, user_dir), platform)
    except (OSError, tarfile.TarError) as error:
        return None, f"Couldn't unpack the viewer that came with the add-on: {error}"
    if not os.path.exists(app):
        return None, "The viewer that came with the add-on isn't for this system: install the build for it"
    return app, None


def launch_command(app: str, shot: str, platform: str = sys.platform) -> list[str]:
    """The command that opens `shot` in RapidVis."""
    if platform == "darwin" and app.endswith(".app"):
        return ["open", "-n", app, "--args", shot]  # a macOS app is a folder: the system starts it
    return [app, shot]
