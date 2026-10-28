"""Which objects RapidVis leaves out of a shot. Plain Python (no bpy), so pytest can check it.

RapidVis is for timing, layout and lighting changes, so it shows what glTF can show faithfully and
leaves out what would only arrive as a block: planes that only cast shadows, guide meshes, a cube
holding a volume (fog, underwater haze), and see-through cards (brush strokes, particles) whose
shape comes from shader nodes, which glTF would draw as solid rectangles. Shaped geometry with a
material glTF can't carry is kept: its silhouette is still right. Each left-out object stays as an
empty node, so its place in the hierarchy and its animation stay.
"""

SURFACE = "surface"
VOLUME = "volume"  # only a volume: glTF has none, so it would be a solid block
PROCEDURAL_CUTOUT = "procedural cutout"  # see-through where shader nodes say: glTF draws it solid


def looks_like_cards(open_edges: int, edges: int) -> bool:
    """Cards or strips (brush strokes, particles), not a shaped surface. An edge is open when only
    one face uses it: every edge of a loose card is, and half of a strip's, but a shaped surface's
    open edges are only its outline, if it has one at all (gold_splash: strokes 34-100%, fins 0%)."""
    return edges > 0 and open_edges >= 0.25 * edges


def is_left_out(seen_by_camera: bool, material_kinds: list[str], cards: bool) -> bool:
    """True for an object RapidVis can't show as it renders: hidden from camera rays, only volume,
    or see-through cards. `material_kinds` holds one of the kinds above per material."""
    if not seen_by_camera:
        return True
    if not material_kinds or SURFACE in material_kinds:
        return False
    if all(kind == VOLUME for kind in material_kinds):
        return True
    return cards
