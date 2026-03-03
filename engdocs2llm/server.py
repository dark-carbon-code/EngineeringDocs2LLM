"""
EngineeringDocs2LLM Converter — Server

Flask application that handles:
1. File upload and format detection
2. Routing to the correct extractor (DXF, PDF, XLSX, CSV, DOCX, TXT)
3. Building LLM context from extracted data
4. Proxying queries to the Anthropic API with vision support

Run: python server.py
Open: http://localhost:5000
"""

import os
import sys
import json
import time
import base64
import traceback
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

try:
    from flask_cors import CORS
    HAS_CORS = True
except ImportError:
    HAS_CORS = False

# Local extractors
from extractors import dxf_extractor
from extractors import pdf_extractor
from extractors.tabular_extractor import extract_xlsx, extract_csv, extract_docx, extract_txt

# ─── Configuration ────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder="static")
if HAS_CORS:
    CORS(app)

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100MB max upload

ALLOWED_EXTENSIONS = {
    "dxf", "dwg",                       # CAD
    "pdf",                               # PDF
    "xlsx", "xls", "csv",               # Tabular
    "docx", "txt",                       # Text
    "png", "jpg", "jpeg", "tiff", "tif", # Image
}

# In-memory store for extracted data (per session, simple approach)
extracted_data = {}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_ext(filename):
    return filename.rsplit(".", 1)[1].lower() if "." in filename else ""


def image_to_base64(filepath):
    """Read an image file and return base64-encoded string."""
    with open(filepath, "rb") as f:
        return base64.b64encode(f.read()).decode()


def extract_image(filepath):
    """Extract metadata from an image file for vision."""
    from PIL import Image
    img = Image.open(filepath)
    buf = __import__("io").BytesIO()
    
    # Convert to PNG for consistency
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    
    # Thumbnail
    thumb = img.copy()
    thumb.thumbnail((400, 400))
    tbuf = __import__("io").BytesIO()
    thumb.save(tbuf, format="JPEG", quality=75)
    thumb_b64 = base64.b64encode(tbuf.getvalue()).decode()
    
    return {
        "format": "image",
        "width": img.width,
        "height": img.height,
        "image_base64": b64,
        "thumbnail_base64": thumb_b64,
        "stats": {
            "width": img.width,
            "height": img.height,
            "mode": img.mode,
        },
    }


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/status")
def status():
    """Check system capabilities."""
    return jsonify({
        "ezdxf": dxf_extractor.check_available(),
        "pdfplumber": pdf_extractor.check_available(),
        "max_upload_mb": 100,
        "extracted_files": len(extracted_data),
    })


@app.route("/api/upload", methods=["POST"])
def upload_file():
    """Upload and extract a file."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "" or not allowed_file(file.filename):
        return jsonify({"error": f"Invalid file. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"}), 400

    filename = secure_filename(file.filename)
    filepath = UPLOAD_DIR / filename
    file.save(str(filepath))

    ext = get_ext(filename)
    file_id = f"{int(time.time())}_{filename}"

    try:
        # Route to correct extractor
        if ext == "dxf":
            result = dxf_extractor.extract_dxf(str(filepath))
            result["format"] = "dxf"
        elif ext == "dwg":
            result = {
                "format": "dwg",
                "error": None,
                "message": "DWG detected. For full extraction, convert to DXF using ODA File Converter. "
                           "If you have the ODA tool installed, place the converter path in .env as ODA_PATH.",
                "requires_conversion": True,
                "stats": {"file_size": os.path.getsize(filepath)},
            }
            # Check if ODA converter is available
            oda_path = os.environ.get("ODA_PATH", "")
            if oda_path and os.path.exists(oda_path):
                # Attempt conversion
                import subprocess
                dxf_path = filepath.with_suffix(".dxf")
                try:
                    subprocess.run([
                        oda_path,
                        str(filepath.parent), str(dxf_path.parent),
                        "ACAD2018", "DXF", "0", "1", str(filepath.name)
                    ], check=True, timeout=60)
                    if dxf_path.exists():
                        result = dxf_extractor.extract_dxf(str(dxf_path))
                        result["format"] = "dwg_converted"
                        result["message"] = "DWG successfully converted to DXF via ODA and extracted."
                except Exception as e:
                    result["conversion_error"] = str(e)

        elif ext == "pdf":
            result = pdf_extractor.extract_pdf(str(filepath))
            result["format"] = "pdf"
        elif ext in ("xlsx", "xls"):
            result = extract_xlsx(str(filepath))
        elif ext == "csv":
            result = extract_csv(str(filepath))
        elif ext == "docx":
            result = extract_docx(str(filepath))
        elif ext == "txt":
            result = extract_txt(str(filepath))
        elif ext in ("png", "jpg", "jpeg", "tiff", "tif"):
            result = extract_image(str(filepath))
        else:
            result = {"format": "unknown", "error": f"No extractor for .{ext}"}

        # Store result
        result["file_id"] = file_id
        result["filename"] = filename
        result["file_size"] = os.path.getsize(filepath)
        extracted_data[file_id] = result

        # Return without large base64 data (send separately via /api/page_image)
        response = {k: v for k, v in result.items()}
        # Strip base64 from pages for the list response (keep thumbnails)
        if "pages" in response:
            for page in response["pages"]:
                page.pop("image_base64", None)
        if response.get("format") == "image":
            response.pop("image_base64", None)

        return jsonify(response)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route("/api/page_image/<file_id>/<int:page_num>")
def get_page_image(file_id, page_num):
    """Get the full-resolution rendered image for a specific page."""
    data = extracted_data.get(file_id)
    if not data or "pages" not in data:
        return jsonify({"error": "File not found"}), 404

    for page in data["pages"]:
        if page.get("page_num") == page_num and "image_base64" in page:
            return jsonify({"image_base64": page["image_base64"]})

    return jsonify({"error": "Page not found"}), 404


@app.route("/api/thumbnail/<file_id>")
def get_thumbnail(file_id):
    """Get thumbnail for an image file."""
    data = extracted_data.get(file_id)
    if not data:
        return jsonify({"error": "File not found"}), 404
    tb = data.get("thumbnail_base64") or (data.get("pages", [{}])[0].get("thumbnail_base64") if data.get("pages") else None)
    if tb:
        return jsonify({"thumbnail_base64": tb})
    return jsonify({"error": "No thumbnail"}), 404


@app.route("/api/extracted")
def list_extracted():
    """List all extracted files (without base64 data)."""
    items = []
    for fid, data in extracted_data.items():
        summary = {
            "file_id": fid,
            "filename": data.get("filename", ""),
            "format": data.get("format", "unknown"),
            "stats": data.get("stats", {}),
        }
        items.append(summary)
    return jsonify({"files": items})


@app.route("/api/extracted/<file_id>")
def get_extracted(file_id):
    """Get full extraction data for a specific file (without images)."""
    data = extracted_data.get(file_id)
    if not data:
        return jsonify({"error": "File not found"}), 404
    # Strip large base64 fields
    response = json.loads(json.dumps(data, default=str))
    if "pages" in response:
        for page in response["pages"]:
            page.pop("image_base64", None)
    response.pop("image_base64", None)
    return jsonify(response)


@app.route("/api/clear", methods=["POST"])
def clear_data():
    """Clear all extracted data and uploads."""
    extracted_data.clear()
    for f in UPLOAD_DIR.iterdir():
        f.unlink(missing_ok=True)
    return jsonify({"status": "cleared"})


@app.route("/api/chat", methods=["POST"])
def chat():
    """Send a query to the Anthropic API with extracted document context."""
    body = request.json
    api_key = body.get("api_key", "").strip()
    user_message = body.get("message", "").strip()
    history = body.get("history", [])

    if not api_key:
        return jsonify({"error": "API key required. Enter your Anthropic API key in the settings bar."}), 400
    if not user_message:
        return jsonify({"error": "Message required"}), 400

    # Build context from all extracted files
    text_context = []
    image_parts = []

    for fid, data in extracted_data.items():
        fmt = data.get("format", "unknown")
        fname = data.get("filename", "unknown")
        text_context.append(f"\n## Document: {fname} ({fmt})")

        if fmt in ("dxf", "dwg_converted"):
            # Structured CAD data — the gold
            text_context.append(f"### Extraction Stats: {json.dumps(data.get('stats', {}))}")

            equip = data.get("equipment", [])
            if equip:
                text_context.append(f"### Equipment ({len(equip)} items):")
                for e in equip[:50]:
                    attrs = e.get("attributes", {})
                    tag = e.get("tag", "no tag")
                    text_context.append(f"  - {tag} | block: {e.get('block_name','')} | layer: {e.get('layer','')} | type: {e.get('type','')} | attrs: {json.dumps(attrs)}")

            instr = data.get("instruments", [])
            if instr:
                text_context.append(f"### Instruments ({len(instr)} items):")
                for inst in instr[:50]:
                    text_context.append(f"  - {inst.get('tag','no tag')} | block: {inst.get('block_name','')} | layer: {inst.get('layer','')} | attrs: {json.dumps(inst.get('attributes', {}))}")

            conns = data.get("connections", [])
            if conns:
                text_context.append(f"### Connectivity ({len(conns)} connections):")
                for c in conns[:100]:
                    text_context.append(f"  - {c['from']} → {c['to']} (via {c.get('line_layer', '')})")

            graph = data.get("graph")
            if graph:
                text_context.append(f"### Graph: {graph.get('components', 0)} connected components, connected={graph.get('is_connected', False)}")

            annot = data.get("annotations", [])
            if annot:
                text_context.append(f"### Annotations ({len(annot)} items):")
                for a in annot[:30]:
                    text_context.append(f"  - \"{a['text']}\" near {a.get('associated_equipment', 'N/A')} (layer: {a.get('layer', '')})")

            layers = data.get("layers", {})
            if layers:
                active = {k: v for k, v in layers.items() if v.get("entity_count", 0) > 0}
                text_context.append(f"### Active Layers ({len(active)}):")
                for name, info in sorted(active.items(), key=lambda x: -x[1].get("entity_count", 0))[:20]:
                    text_context.append(f"  - {name}: {info['entity_count']} entities, color={info.get('color', '')}")

        elif fmt == "pdf":
            pages = data.get("pages", [])
            has_text = any(p.get("has_text") for p in pages)
            text_context.append(f"PDF with {len(pages)} pages. Text layer: {'YES' if has_text else 'NO'}")

            if has_text:
                full_text = data.get("full_text", "")
                text_context.append(f"### Extracted Text:\n{full_text[:6000]}")

            tables = data.get("all_tables", [])
            if tables:
                text_context.append(f"### Tables ({len(tables)} found):")
                for t in tables[:10]:
                    text_context.append(f"  Page {t['page']}: headers={t['headers']}, {len(t['rows'])} rows")
                    for row in t["rows"][:5]:
                        text_context.append(f"    {row}")

            # Add page images for vision (first message only)
            if not history:
                for page in pages[:8]:
                    if page.get("image_base64"):
                        image_parts.append({
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/png", "data": page["image_base64"]},
                        })

        elif fmt == "image":
            text_context.append(f"Image file: {data.get('stats', {}).get('width', '?')}x{data.get('stats', {}).get('height', '?')}")
            if not history and data.get("image_base64"):
                image_parts.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/png", "data": data["image_base64"]},
                })

        elif fmt in ("xlsx", "csv"):
            headers = data.get("headers", [])
            rows = data.get("rows", [])
            text_context.append(f"Spreadsheet: {len(rows)} rows, {len(headers)} columns")
            text_context.append(f"Columns: {', '.join(headers)}")
            text_context.append(f"### Data (first 30 rows):")
            # Convert to dict format for readability
            for row in rows[:30]:
                row_dict = {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}
                text_context.append(f"  {json.dumps(row_dict)}")

        elif fmt in ("docx", "txt"):
            text = data.get("full_text", "")
            text_context.append(f"### Content:\n{text[:6000]}")
            tables = data.get("tables", [])
            if tables:
                for t in tables:
                    text_context.append(f"### Table: headers={t['headers']}, {t['row_count']} rows")
                    for row in t["rows"][:10]:
                        text_context.append(f"  {row}")

    context_str = "\n".join(text_context)

    system_prompt = f"""You are EngineeringDocs2LLM, a process safety engineering AI assistant.

You have been given REAL extracted data from engineering documents uploaded by the user. This data was extracted programmatically — it is not simulated.

For DXF/DWG files: You have structured entity data extracted by ezdxf — equipment blocks with attributes, layer organization, connectivity graphs, instrument data, and annotations. This is the richest data source. Use it to identify equipment, trace process flows, find safety gaps, and analyze P&ID completeness.

For PDFs: You may have extracted text layers, detected tables, and rendered page images (visible to you). Describe what you actually see and read.

For spreadsheets: You have the complete parsed tabular data. Reference specific rows, columns, and values.

GUIDELINES:
- Reference specific equipment tags, layer names, connections, and data values.
- If connectivity data shows a graph, describe the process flow.
- Identify safety-relevant findings: missing instruments, unconnected equipment, incomplete safeguards.
- Be specific. Cite the actual data. Don't invent what isn't there.
- If data is incomplete or ambiguous, say so.

## Extracted Document Data
{context_str}"""

    # Build API messages
    api_messages = []
    for msg in history:
        api_messages.append({"role": msg["role"], "content": msg["content"]})

    # User message with optional images
    user_content = []
    if image_parts and not history:
        user_content.extend(image_parts[:8])
    user_content.append({"type": "text", "text": user_message})
    api_messages.append({"role": "user", "content": user_content})

    # Call Anthropic API
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=system_prompt,
            messages=api_messages,
        )
        reply = "".join(block.text for block in response.content if hasattr(block, "text"))
        return jsonify({"reply": reply})

    except ImportError:
        # Fallback: use requests directly
        import urllib.request
        import ssl

        payload = json.dumps({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 2000,
            "system": system_prompt,
            "messages": api_messages,
        }).encode()

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )

        try:
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
                data = json.loads(resp.read().decode())
                reply = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
                return jsonify({"reply": reply})
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()
            return jsonify({"error": f"API error {e.code}: {error_body}"}), e.code
        except Exception as e:
            return jsonify({"error": f"Request failed: {str(e)}"}), 500


@app.route("/api/export/<file_id>")
def export_extraction(file_id):
    """Export extracted data as JSON file."""
    data = extracted_data.get(file_id)
    if not data:
        return jsonify({"error": "File not found"}), 404

    # Strip base64 image data for export
    export = json.loads(json.dumps(data, default=str))
    if "pages" in export:
        for page in export["pages"]:
            page.pop("image_base64", None)
            page.pop("thumbnail_base64", None)
    export.pop("image_base64", None)
    export.pop("thumbnail_base64", None)

    output_path = OUTPUT_DIR / f"{data.get('filename', 'export')}.extracted.json"
    with open(output_path, "w") as f:
        json.dump(export, f, indent=2, default=str)

    return jsonify({"path": str(output_path), "data": export})


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Load .env if present
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    print("=" * 60)
    print("  EngineeringDocs2LLM Converter")
    print("=" * 60)
    print(f"  ezdxf (DXF/DWG):  {'AVAILABLE' if dxf_extractor.check_available() else 'NOT INSTALLED - run: pip install ezdxf'}")
    print(f"  pdfplumber (PDF): {'AVAILABLE' if pdf_extractor.check_available() else 'NOT INSTALLED - run: pip install pdfplumber'}")
    print(f"  ODA Converter:    {os.environ.get('ODA_PATH', 'Not configured (optional, for DWG→DXF)')}")
    print(f"  Upload dir:       {UPLOAD_DIR.absolute()}")
    print(f"  Output dir:       {OUTPUT_DIR.absolute()}")
    print()
    print("  Open in browser:  http://localhost:5000")
    print("=" * 60)

    app.run(host="0.0.0.0", port=5000, debug=True)
