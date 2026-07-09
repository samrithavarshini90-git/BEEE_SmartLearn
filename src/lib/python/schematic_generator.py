import sys
import json

try:
    import schemdraw
    import schemdraw.elements as elm
except Exception as import_error:
    schemdraw = None
    elm = None
    SCHEMDRAW_IMPORT_ERROR = import_error
else:
    SCHEMDRAW_IMPORT_ERROR = None


def safe_float(value, default):
    try:
        return float(value)
    except Exception:
        return default


def apply_direction_and_length(element, direction, length):
    direction = direction if direction in ("right", "left", "up", "down") else "right"
    length = max(0.5, safe_float(length, 3))

    direction_method = getattr(element, direction, None)
    if callable(direction_method):
        try:
            try:
                element = direction_method(length=length)
            except TypeError:
                element = direction_method()
        except Exception:
            pass
    else:
        try:
            element = element.direction(direction)
        except Exception:
            pass

    length_method = getattr(element, "length", None)
    if callable(length_method):
        try:
            element = length_method(length)
        except Exception:
            pass

    return element


def apply_label(element, label):
    if not label:
        return element

    label_method = getattr(element, "label", None)
    if callable(label_method):
        try:
            return label_method(str(label))
        except Exception:
            return element

    return element


def generate_svg(instructions):
    if schemdraw is None or elm is None:
        raise RuntimeError(f"Schemdraw is not available: {SCHEMDRAW_IMPORT_ERROR}")

    d = schemdraw.Drawing(show=False)

    element_map = {
        "Resistor": elm.Resistor,
        "Capacitor": elm.Capacitor,
        "Inductor": elm.Inductor2,
        "BatteryCell": elm.BatteryCell,
        "SourceV": elm.SourceV,
        "SourceI": elm.SourceI,
        "Diode": elm.Diode,
        "BjtNpn": elm.BjtNpn,
        "Line": elm.Line,
        "Ground": elm.Ground,
    }

    if not isinstance(instructions, list) or not instructions:
        raise ValueError("No schemdraw instructions were provided.")

    for index, inst in enumerate(instructions, start=1):
        if not isinstance(inst, dict):
            raise ValueError(f"Instruction {index} must be an object.")

        el_type = inst.get("type")
        ElementClass = element_map.get(el_type)
        if ElementClass is None:
            raise ValueError(f"Unsupported schemdraw element type: {el_type}")

        element = ElementClass()
        element = apply_direction_and_length(
            element,
            inst.get("direction", "right"),
            inst.get("length", 3),
        )
        element = apply_label(element, inst.get("label", ""))

        try:
            d.add(element)
        except Exception as exc:
            raise RuntimeError(
                f"Instruction {index} ({el_type}) could not be added to the drawing: {exc}"
            ) from exc

    svg_bytes = d.get_imagedata("svg")
    return svg_bytes.decode("utf-8")


if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        instructions = json.loads(input_data)
        print(generate_svg(instructions))
    except Exception as exc:
        print(f"Error generating Schemdraw SVG: {exc}", file=sys.stderr)
        sys.exit(1)
