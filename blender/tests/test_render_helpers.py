from rapidvis_addon.render_helpers import (
    PROCEDURAL_CUTOUT,
    SURFACE,
    VOLUME,
    is_left_out,
    looks_like_cards,
)


def test_an_object_hidden_from_the_camera_is_left_out():
    # e.g. a plane that only casts shadows
    assert is_left_out(False, [SURFACE], cards=False)


def test_a_volume_only_object_is_left_out():
    # e.g. a cube full of underwater haze: in glTF it could only be a solid block
    assert is_left_out(True, [VOLUME], cards=False)


def test_see_through_cards_are_left_out():
    # e.g. brush strokes or particles, made round and soft by shader nodes: solid squares in glTF
    assert is_left_out(True, [PROCEDURAL_CUTOUT], cards=True)


def test_shaped_geometry_with_soft_edges_is_kept():
    # e.g. a fin: glTF can't make its edge soft, but its shape is still right
    assert not is_left_out(True, [PROCEDURAL_CUTOUT], cards=False)


def test_one_surface_material_is_enough_to_keep_it():
    assert not is_left_out(True, [VOLUME, SURFACE], cards=False)
    assert not is_left_out(True, [PROCEDURAL_CUTOUT, SURFACE], cards=True)


def test_ordinary_objects_are_kept():
    assert not is_left_out(True, [SURFACE], cards=False)
    assert not is_left_out(True, [], cards=False)


def test_loose_cards_and_strips_look_like_cards():
    assert looks_like_cards(open_edges=4, edges=4)  # one card
    assert looks_like_cards(open_edges=400, edges=400)  # a hundred loose cards
    assert looks_like_cards(open_edges=22, edges=31)  # a strip of ten quads


def test_shaped_surfaces_do_not():
    assert not looks_like_cards(open_edges=0, edges=300)  # a closed shape, like a fin with thickness
    assert not looks_like_cards(open_edges=40, edges=220)  # a 10x10 grid: only its outline is open
    assert not looks_like_cards(open_edges=0, edges=0)
