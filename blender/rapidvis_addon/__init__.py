"""RapidVis for Blender: send a shot to RapidVis for review

The Blender-only parts are imported inside register(), not at the top, so that plain Python
(and pyset) can import `rapidvis_addon.manifest` without Blender's `bpy` module existing.
"""
def register():
    from . import export
    export.register()


def unregister():
    from . import export
    export.unregister()
