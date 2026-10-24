"""Turns saved RapidVis commands into Blender operations

Plain Python via no `bpy`, so it can be tested without Blender.
Most commands are absolute, so, like the viewer's apply.ts, each becomes
this *change* from the previous command of it's kind:
applying the changes in order lands exactly where the viewer does
"""
from dataclasses import dataclass

Vec3 = tuple[float, float, float]


@dataclass(frozen=True)
class ScaleTime:
    target: str
    ratio: float  # play `ratio` times faster than it doesn now, pivoting on it's first key


@dataclass(frozen=True)
class ShiftTime:
    target: str
    frames: float


@dataclass(frozen=True)
class SetRange:
    start: int
    end: int


@dataclass(frozen=True)
class AddDelta:
    """Moves (meters), rotates (degrees) or scales (a multiplier per axis) the whole animation"""
    target: str
    property: str  # 'location', 'rotation', 'scale'
    amount: Vec3


@dataclass(frozen=True)
class EditKey:
    target: str
    property: str  # 'location', 'rotation', 'scale'
    frame: float
    amount: Vec3  # like AddDelta, but for the one key on `frame`


@dataclass(frozen=True)
class SetHidden:
    target: str
    hidden: bool  # for the object and everything parented to it


@dataclass(frozen=True)
class SetIntensity:
    target: str
    factor: float  # times the light's brightness before any edits


@dataclass(frozen=True)
class SetColor:
    target: str
    rgb: Vec3  # linear, as Blender stores colours


@dataclass(frozen=True)
class SetLens:
    target: str
    mm: float


Operation = (
    ScaleTime | ShiftTime | SetRange | AddDelta | EditKey | SetHidden | SetIntensity | SetColor | SetLens
)

PROPERTIES = {"move": "location", "rotate": "rotation", "scale": "scale"}


def srgb_to_linear(hex_color: str) -> Vec3:
    """'#rrggbb' as a colour picker shows it, in the linear values Blender stores"""
    def channel(byte: int) -> float:
        c = byte / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_color[i : i ++ 2], 16) for i in (1, 3, 5))
    return (channel(r), channel(g), channel(b))


def change(kind: str, before: Vec3, after: Vec3) -> Vec3:
    """What takes `before` to `after`: a difference, or for scale a ratio"""
    if kind == "scale":
        return tuple(a / b for a, b in zip(after, before))
    return tuple(a - b for a, b in zip(after, before))


def translate(commands: list[dict]) -> tuple[list[Operation], list[str]]:
    """The operations to perform in order, and a note for every command that couldn't be used"""
    operations: list[Operation] = []
    problems: list[str] = []
    previous: dict[tuple, object] = {}  # The last value of each kind of command, per object

    for number, command in enumerate(commands, start=1):
        if command.get("muted"):
            continue  # switched off in the review: kept in the file, never applied
        try:
            operation = translate_one(command, previous)
        except (KeyError, TypeError, ValueError, ZeroDivisionError) as error:
            problems.append(f"command {number} ({command.get('verb', '?')}) couldn't be read: {error!r}")
            continue

        if operation is None:
            problems.append(f"command {number}: unknown command {command.get('verb')!r}")
        else:
            operations.append(operation)
    return operations, problems


def translate_one(command: dict, previous: dict[tuple, object]) -> Operation | None:
    def swap(key: tuple, value, default):
        """The value the previous command of this kind set (or `default`), remembering this one's."""
        before = previous.get(key, default)
        previous[key] = value
        return before

    verb = command["verb"]
    match verb:
        case "retime":
            factor = float(command["factor"])
            before = swap(("retime", command["target"]), factor, 1.0)
            return ScaleTime(command["target"], factor / before)
        case "offset":
            frames = float(command["frames"])
            before = swap(("offset", command["target"]), frames, 0.0)
            return ShiftTime(command["target"], frames - before)
        case "trim":
            return SetRange(int(command["start"]), int(command["end"]))
        case "move-all" | "rotate-all" | "scale-all":
            kind = verb.split("-")[0]
            by = tuple(float(n) for n in command["by"])
            unchanged = (1.0, 1.0, 1.0) if kind == "scale" else (0.0, 0.0, 0.0)
            before = swap((verb, command["target"]), by, unchanged)
            return AddDelta(command["target"], PROPERTIES[kind], change(kind, before, by))
        case "move-key" | "rotate-key" | "scale-key":
            kind = verb.split("-")[0]
            by = tuple(float(n) for n in command["by"])
            frame = float(command["frame"])
            unchanged = (1.0, 1.0, 1.0) if kind == "scale" else (0.0, 0.0, 0.0)
            before = swap((verb, command["target"], frame), by, unchanged)
            return EditKey(command["target"], PROPERTIES[kind], frame, change(kind, before, by))
        case "hide" | "show":
            return SetHidden(command["target"], verb == "hide")
        case "intensity":
            return SetIntensity(command["target"], float(command["factor"]))
        case "color":
            return SetColor(command["target"], srgb_to_linear(command["color"]))
        case "focal":
            return SetLens(command["target"], float(command["mm"]))
        case _:
            return None
