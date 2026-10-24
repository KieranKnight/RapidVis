"""The add-on's settings, in Edit > Preferences > Add-ons > RapidVis."""

import bpy
from bpy.props import StringProperty


class RAPIDVIS_AP_preferences(bpy.types.AddonPreferences):
    bl_idname = __package__  # preferences belong to the add-on's package, not to this module

    app_path: StringProperty(
        name="RapidVis app",
        description="RapidVis.exe (or RapidVis.app on macOS), opened on each exported shot",
        subtype="FILE_PATH",
    )

    def draw(self, context):
        self.layout.prop(self, "app_path")


def app_path(context: bpy.types.Context) -> str:
    """Where RapidVis is, from the preferences ('' when unset, or when run from a script)."""
    addon = context.preferences.addons.get(__package__)
    return bpy.path.abspath(addon.preferences.app_path) if addon else ""


def register():
    bpy.utils.register_class(RAPIDVIS_AP_preferences)


def unregister():
    bpy.utils.unregister_class(RAPIDVIS_AP_preferences)
