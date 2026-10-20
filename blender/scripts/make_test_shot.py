import math
import bpy

# Clear out every object so the script always builds the same scene
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 48


def make_material(name, rgb):
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    return mat


scene.render.fps = 24

bpy.ops.mesh.primitive_plane_add(size=10)
ground = bpy.context.active_object
ground.name = "ground"
ground.data.materials.append(make_material("ground_mat", (0.5, 0.5, 0.5)))

props = bpy.data.objects.new("props", None)  # None = a Empty (no data)
scene.collection.objects.link(props)

bpy.ops.mesh.primitive_cube_add(size=1)
cube = bpy.context.active_object
cube.name = "cube"
cube.parent = props
cube.data.materials.append(make_material("cube_mat", (0.2, 0.45, 0.9)))

# Three keys: left, hight in the middle, right
for frame, loc in [(1, (-3, 0, 0.5)), (24, (0, 0, 2.5)), (48, (3, 0, 0.5))]:
    cube.location = loc
    cube.keyframe_insert("location", frame=frame)

cam_data = bpy.data.cameras.new("shotCam")
cam = bpy.data.objects.new("shotCam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

cam.rotation_euler = (math.radians(75), 0, 0)  # tilted to look slightly down
for frame, loc, lens in [(1, (-1, -10, 3), 35), (48, (1, -8, 3), 50)]:
    cam.location = loc
    cam.keyframe_insert("location", frame=frame)
    cam_data.lens = lens
    cam_data.keyframe_insert("lens", frame=frame)

light_data = bpy.data.lights.new("key_light", type="POINT")
light_data.energy = 1000  # watts
light = bpy.data.objects.new("key_light", light_data)
light.location = (3, -3, 5)
scene.collection.objects.link(light)

scene.frame_set(1)
print("RapidVis test shot built")

