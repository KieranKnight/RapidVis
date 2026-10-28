"""The add-on's settings, in Edit > Preferences > Add-ons > RapidVis."""

import bpy
from bpy.props import StringProperty


class RAPIDVIS_AP_preferences(bpy.types.AddonPreferences):
    bl_idname = __package__  # preferences belong to the add-on's package, not to this module

    app_path: StringProperty(
        name="Use another RapidVis",
        description=(
            "Leave empty to open shots in the viewer that comes with the add-on. "
            "Or pick another RapidVis.exe (RapidVis.app on macOS, rapidvis on Linux)"
        ),
        subtype="FILE_PATH",
    )

    def draw(self, context):
        self.layout.prop(self, "app_path")


def app_path(context: bpy.types.Context) -> str:
    """Another RapidVis to use instead of the bundled one ('' when unset, or when run from a script)."""
    addon = context.preferences.addons.get(__package__)
    return bpy.path.abspath(addon.preferences.app_path) if addon else ""


def viewer_folder() -> str:
    """Where the bundled viewer is unpacked: the add-on's own user folder, kept across updates."""
    try:
        return bpy.utils.extension_path_user(__package__, path="viewer", create=True)
    except ValueError:  # installed the old way, as a legacy add-on rather than an extension
        return bpy.utils.user_resource("CONFIG", path="rapidvis/viewer", create=True)


def register():
    bpy.utils.register_class(RAPIDVIS_AP_preferences)


def unregister():
    bpy.utils.unregister_class(RAPIDVIS_AP_preferences)
