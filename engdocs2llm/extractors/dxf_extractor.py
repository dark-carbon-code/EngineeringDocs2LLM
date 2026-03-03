"""
DXF/DWG Extractor — Real structured entity extraction using ezdxf.

Extracts:
- Equipment (INSERT entities with block attributes: tag, service, spec)
- Layers (names, colors, entity counts)  
- Connectivity (line endpoints matched to equipment positions)
- Instruments (INSERTs on instrument layers)
- Annotations (TEXT/MTEXT entities with spatial association)
- Line list (pipe segments with layer/spec info)

DWG files must be converted to DXF first using ODA File Converter.
"""

import math
from collections import defaultdict

try:
    import ezdxf
    from ezdxf.math import Vec3
    HAS_EZDXF = True
except ImportError:
    HAS_EZDXF = False

try:
    import networkx as nx
    HAS_NX = True
except ImportError:
    HAS_NX = False


def check_available():
    """Check if ezdxf is installed."""
    return HAS_EZDXF


def extract_dxf(filepath, proximity_threshold=10.0):
    """
    Extract structured P&ID data from a DXF file.
    
    Args:
        filepath: Path to the DXF file
        proximity_threshold: Max distance to match line endpoints to equipment (in drawing units)
    
    Returns:
        dict with equipment, layers, connectivity, instruments, annotations, stats
    """
    if not HAS_EZDXF:
        return {"error": "ezdxf is not installed. Run: pip install ezdxf"}

    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()

    # ── 1. Extract all layers ──
    layers = {}
    for layer in doc.layers:
        layers[layer.dxf.name] = {
            "name": layer.dxf.name,
            "color": layer.color,
            "is_on": layer.is_on(),
            "is_frozen": layer.is_frozen(),
            "entity_count": 0,
        }

    # Count entities per layer
    for entity in msp:
        layer_name = entity.dxf.layer if hasattr(entity.dxf, 'layer') else "0"
        if layer_name in layers:
            layers[layer_name]["entity_count"] += 1

    # ── 2. Extract equipment (INSERT entities with attributes) ──
    equipment = []
    equipment_positions = {}  # tag -> position for connectivity

    for insert in msp.query("INSERT"):
        block_name = insert.dxf.name
        layer_name = insert.dxf.layer
        position = list(insert.dxf.insert)[:2]  # x, y only

        # Extract all attributes
        attrs = {}
        for attrib in insert.attribs:
            tag = attrib.dxf.tag
            text = attrib.dxf.text
            if text and text.strip():
                attrs[tag] = text.strip()

        # Try to find the equipment tag from common attribute names
        tag = (attrs.get("TAG") or attrs.get("TAGNO") or attrs.get("TAG_NUMBER") or
               attrs.get("EQUIP_TAG") or attrs.get("EQUIPMENT") or
               attrs.get("INSTRUMENT") or attrs.get("INST_TAG") or
               attrs.get("NUMBER") or "")

        # Classify by layer name patterns
        equipment_type = classify_by_layer(layer_name, block_name)

        item = {
            "block_name": block_name,
            "layer": layer_name,
            "position": position,
            "attributes": attrs,
            "tag": tag,
            "type": equipment_type,
        }
        equipment.append(item)

        if tag:
            equipment_positions[tag] = position

    # ── 3. Separate instruments from equipment ──
    instruments = []
    process_equipment = []
    for item in equipment:
        if item["type"] in ("instrument", "control_valve"):
            instruments.append(item)
        else:
            process_equipment.append(item)

    # ── 4. Extract line segments for connectivity ──
    lines = []
    for entity in msp.query("LINE"):
        start = list(entity.dxf.start)[:2]
        end = list(entity.dxf.end)[:2]
        lines.append({
            "start": start,
            "end": end,
            "layer": entity.dxf.layer,
        })

    for entity in msp.query("LWPOLYLINE"):
        points = list(entity.get_points(format="xy"))
        layer = entity.dxf.layer
        for i in range(len(points) - 1):
            lines.append({
                "start": list(points[i]),
                "end": list(points[i + 1]),
                "layer": layer,
            })

    # ── 5. Build connectivity graph ──
    connections = []
    for line in lines:
        start = line["start"]
        end = line["end"]
        from_equip = find_nearest_equipment(equipment_positions, start, proximity_threshold)
        to_equip = find_nearest_equipment(equipment_positions, end, proximity_threshold)

        if from_equip and to_equip and from_equip != to_equip:
            connections.append({
                "from": from_equip,
                "to": to_equip,
                "line_layer": line["layer"],
            })

    # Deduplicate connections
    seen = set()
    unique_connections = []
    for conn in connections:
        key = (conn["from"], conn["to"])
        rev_key = (conn["to"], conn["from"])
        if key not in seen and rev_key not in seen:
            seen.add(key)
            unique_connections.append(conn)

    # ── 6. Build networkx graph if available ──
    graph_data = None
    if HAS_NX and unique_connections:
        G = nx.Graph()
        for conn in unique_connections:
            G.add_edge(conn["from"], conn["to"], layer=conn["line_layer"])
        graph_data = {
            "nodes": list(G.nodes()),
            "edges": [{"from": u, "to": v, **d} for u, v, d in G.edges(data=True)],
            "is_connected": nx.is_connected(G) if len(G.nodes()) > 0 else False,
            "components": nx.number_connected_components(G),
        }

    # ── 7. Extract text annotations ──
    annotations = []
    for entity in msp.query("TEXT"):
        text = entity.dxf.text if hasattr(entity.dxf, 'text') else ""
        if text and text.strip():
            pos = list(entity.dxf.insert)[:2] if hasattr(entity.dxf, 'insert') else [0, 0]
            nearest = find_nearest_equipment(equipment_positions, pos, proximity_threshold * 3)
            annotations.append({
                "text": text.strip(),
                "position": pos,
                "layer": entity.dxf.layer,
                "associated_equipment": nearest,
            })

    for entity in msp.query("MTEXT"):
        text = entity.text if hasattr(entity, 'text') else ""
        if text and text.strip():
            pos = list(entity.dxf.insert)[:2] if hasattr(entity.dxf, 'insert') else [0, 0]
            nearest = find_nearest_equipment(equipment_positions, pos, proximity_threshold * 3)
            annotations.append({
                "text": text.strip()[:200],
                "position": pos,
                "layer": entity.dxf.layer,
                "associated_equipment": nearest,
            })

    # ── 8. Build line list ──
    line_list = build_line_list(lines, layers)

    # ── 9. Stats ──
    stats = {
        "total_entities": len(list(msp)),
        "total_equipment": len(process_equipment),
        "total_instruments": len(instruments),
        "total_connections": len(unique_connections),
        "total_layers": len(layers),
        "active_layers": len([l for l in layers.values() if l["entity_count"] > 0]),
        "total_annotations": len(annotations),
        "total_line_segments": len(lines),
        "dxf_version": doc.dxfversion,
    }

    return {
        "equipment": process_equipment,
        "instruments": instruments,
        "connections": unique_connections,
        "layers": layers,
        "annotations": annotations,
        "line_list": line_list,
        "graph": graph_data,
        "stats": stats,
    }


def classify_by_layer(layer_name, block_name):
    """Classify equipment type from layer/block naming conventions."""
    ln = layer_name.upper()
    bn = block_name.upper()

    # Instrument layers
    if any(p in ln for p in ["I-", "INST", "INSTR"]):
        if any(v in bn for v in ["FCV", "TCV", "PCV", "LCV", "CTRL"]):
            return "control_valve"
        return "instrument"

    # Piping
    if any(p in ln for p in ["P-PIPE", "PIPING", "P-LINE"]):
        return "piping"

    # Equipment
    if any(p in ln for p in ["P-EQUIP", "EQUIP", "P-VESSEL", "P-MECH"]):
        # Try to classify by block name
        if any(v in bn for v in ["PUMP", "PMP"]):
            return "pump"
        if any(v in bn for v in ["TANK", "TK", "VESSEL", "DRUM"]):
            return "vessel"
        if any(v in bn for v in ["HX", "HEAT", "EXCH", "COOL"]):
            return "heat_exchanger"
        if any(v in bn for v in ["COMP", "BLOWER", "FAN"]):
            return "compressor"
        if any(v in bn for v in ["REACT", "COLUMN", "TOWER"]):
            return "reactor_column"
        return "equipment"

    # Valves
    if any(p in ln for p in ["P-VALVE", "VALVE"]):
        return "valve"

    # Electrical
    if any(p in ln for p in ["E-", "ELEC"]):
        return "electrical"

    return "unknown"


def find_nearest_equipment(positions, point, threshold):
    """Find the nearest equipment tag to a point within threshold distance."""
    best_tag = None
    best_dist = threshold

    for tag, pos in positions.items():
        dist = math.sqrt((pos[0] - point[0]) ** 2 + (pos[1] - point[1]) ** 2)
        if dist < best_dist:
            best_dist = dist
            best_tag = tag

    return best_tag


def build_line_list(lines, layers):
    """Build a summary line list from line segments."""
    by_layer = defaultdict(int)
    for line in lines:
        by_layer[line["layer"]] += 1

    return [
        {"layer": layer, "segment_count": count}
        for layer, count in sorted(by_layer.items(), key=lambda x: -x[1])
        if count > 0
    ]
