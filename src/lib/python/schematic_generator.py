import sys
import json
import schemdraw
import schemdraw.elements as elm

def generate_svg(instructions):
    # Setup schemdraw
    schemdraw.theme('dark')
    d = schemdraw.Drawing(show=False)
    
    # Map string type to schemdraw element class
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
        "Ground": elm.Ground
    }
    
    for inst in instructions:
        el_type = inst.get("type")
        direction = inst.get("direction", "right")
        label = inst.get("label", "")
        length = inst.get("length", 3)
        
        ElementClass = element_map.get(el_type, elm.Line)
        
        # Instantiate element and add to drawing
        e = ElementClass().direction(direction).length(length)
        if label:
            e.label(label)
            
        d.add(e)
        
    # Get the raw SVG string
    svg_bytes = d.get_imagedata('svg')
    return svg_bytes.decode('utf-8')

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        instructions = json.loads(input_data)
        svg_output = generate_svg(instructions)
        print(svg_output)
    except Exception as e:
        print(f"<!-- Error generating SVG: {str(e)} -->", file=sys.stderr)
        sys.exit(1)
