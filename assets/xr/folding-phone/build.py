"""blender --background --python assets/xr/folding-phone/build.py"""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[3]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

def material(name, color, metallic):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = .38
    return mat

body = material('Graphite aluminum', (.065, .085, .11), .7)
hinge = material('Hinge brushed titanium', (.22, .28, .33), .85)

def box(name, center, dimensions, mat, bevel=.004):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    mod = obj.modifiers.new('Editable rounded edges', 'BEVEL')
    mod.width = bevel
    mod.segments = 3
    obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return obj

# Blender +Y は画面の裏。glTF の画面は XY、正面は +Z。
for side, x in [('Left', -.259), ('Right', .259)]:
    box(side + ' folding back', (x, .018, 0), (.514, .028, 1.04), body)
for x in [-.514, .514]:
    box('Side bezel', (x, .009, 0), (.018, .018, 1.04), body)
for z in [-.514, .514]:
    box('End bezel', (0, .009, z), (1.04, .018, .018), body)
box('Central folding hinge', (0, .032, 0), (.016, .018, 1.018), hinge)
scene['screen_bounds_gltf'] = 'x=-0.5..0.5, y=-0.5..0.5, z=0; front=+Z; meters'
scene['fold_angle'] = '180 degrees, open for unobstructed UI'
out = ROOT / 'client/public/xr'
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name('folding-phone.blend')))
bpy.ops.export_scene.gltf(filepath=str(out / 'folding-phone.glb'), export_format='GLB', export_yup=True)
