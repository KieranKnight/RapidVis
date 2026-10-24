"""RapidVis for Blender: send a shot to RapidVis for review, and apply its edits back.

The Blender-only parts are imported inside register(), not at the top, so that plain Python
(and pytest) can import `rapidvis_addon.manifest`, `.translate` and `.launch` without
Blender's `bpy` module existing.
"""


def register():
    from . import apply_edits, export, preferences

    preferences.register()
    export.register()
    apply_edits.register()


def unregister():
    from . import apply_edits, export, preferences

    apply_edits.unregister()
    export.unregister()
    preferences.unregister()
