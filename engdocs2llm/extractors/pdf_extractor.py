"""
PDF Extractor — Real text, table, and image extraction using pdfplumber + pdf2image.

Extracts:
- Text content per page (with layout preservation)
- Tables (auto-detected, returned as row/column data)
- Page images (rendered at configurable DPI for LLM vision)
- Metadata (title, author, page count)
"""

import os
import base64
import json
from io import BytesIO

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


def check_available():
    return HAS_PDFPLUMBER


def extract_pdf(filepath, render_dpi=200, thumbnail_dpi=72, max_pages=20):
    """
    Extract text, tables, and rendered images from a PDF.
    
    Args:
        filepath: Path to the PDF file
        render_dpi: DPI for full-resolution page images (sent to LLM vision)
        thumbnail_dpi: DPI for thumbnail previews
        max_pages: Maximum pages to process
    
    Returns:
        dict with pages, tables, metadata, stats
    """
    if not HAS_PDFPLUMBER:
        return {"error": "pdfplumber not installed. Run: pip install pdfplumber"}

    results = {
        "pages": [],
        "all_tables": [],
        "full_text": "",
        "metadata": {},
        "stats": {},
    }

    # ── Extract text and tables with pdfplumber ──
    with pdfplumber.open(filepath) as pdf:
        results["metadata"] = {
            "page_count": len(pdf.pages),
            "pdf_info": {k: str(v) for k, v in (pdf.metadata or {}).items() if v},
        }

        for i, page in enumerate(pdf.pages[:max_pages]):
            page_data = {
                "page_num": i + 1,
                "width": float(page.width),
                "height": float(page.height),
            }

            # Text extraction
            text = page.extract_text() or ""
            page_data["text"] = text
            page_data["has_text"] = len(text.strip()) > 20
            results["full_text"] += f"\n--- Page {i+1} ---\n{text}\n"

            # Table extraction
            tables = page.extract_tables()
            page_tables = []
            for t_idx, table in enumerate(tables):
                if table and len(table) > 0:
                    # First row as headers if it looks like headers
                    headers = table[0] if table[0] else []
                    rows = table[1:] if len(table) > 1 else []
                    page_tables.append({
                        "table_index": t_idx,
                        "headers": [str(h or "").strip() for h in headers],
                        "rows": [[str(c or "").strip() for c in row] for row in rows],
                        "row_count": len(rows),
                    })
                    results["all_tables"].append({
                        "page": i + 1,
                        "table_index": t_idx,
                        "headers": [str(h or "").strip() for h in headers],
                        "rows": [[str(c or "").strip() for c in row] for row in rows],
                    })

            page_data["tables"] = page_tables
            page_data["table_count"] = len(page_tables)
            results["pages"].append(page_data)

    # ── Render pages to images ──
    if HAS_PDF2IMAGE:
        try:
            # Full resolution for LLM vision
            images = convert_from_path(
                filepath,
                dpi=render_dpi,
                last_page=min(max_pages, results["metadata"]["page_count"]),
            )
            for i, img in enumerate(images):
                if i < len(results["pages"]):
                    # Full resolution base64
                    buf = BytesIO()
                    img.save(buf, format="PNG", optimize=True)
                    results["pages"][i]["image_base64"] = base64.b64encode(buf.getvalue()).decode()
                    results["pages"][i]["image_width"] = img.width
                    results["pages"][i]["image_height"] = img.height

                    # Thumbnail
                    thumb = img.copy()
                    thumb.thumbnail((400, 400))
                    tbuf = BytesIO()
                    thumb.save(tbuf, format="JPEG", quality=75)
                    results["pages"][i]["thumbnail_base64"] = base64.b64encode(tbuf.getvalue()).decode()

        except Exception as e:
            results["render_error"] = str(e)

    # ── Stats ──
    results["stats"] = {
        "total_pages": results["metadata"]["page_count"],
        "pages_processed": len(results["pages"]),
        "pages_with_text": sum(1 for p in results["pages"] if p.get("has_text")),
        "total_tables": len(results["all_tables"]),
        "total_text_chars": len(results["full_text"]),
        "has_images": any(p.get("image_base64") for p in results["pages"]),
    }

    return results
