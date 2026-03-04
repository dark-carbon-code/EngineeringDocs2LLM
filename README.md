# EngineeringDocs2LLM Converter

**Convert P&IDs, HAZOPs, LOPAs, and engineering drawings into structured data for LLM-powered process safety analysis.**

EngineeringDocs2LLM bridges the gap between engineering document formats (DWG, DXF, PDF, XLSX) and Large Language Models. It extracts real structured data from CAD files and documents, then provides an interactive chat interface where Claude analyzes your engineering documents with full vision support for drawings.

---

## Table of Contents

- [Why This Tool Exists](#why-this-tool-exists)
- [System Architecture](#system-architecture)
- [Data Flow Pipeline](#data-flow-pipeline)
- [Quick Start](#quick-start)
- [Supported Formats & Extraction Capabilities](#supported-formats--extraction-capabilities)
- [DWG/DXF Ingestion Pipeline](#dwgdxf-ingestion-pipeline)
- [PDF Processing Pipeline](#pdf-processing-pipeline)
- [Tabular & Text Processing](#tabular--text-processing)
- [LLM Integration & Vision](#llm-integration--vision)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Security Considerations](#security-considerations)
- [Future Roadmap: Sensitivity Engine](#future-roadmap-sensitivity-engine)
- [Troubleshooting](#troubleshooting)
- [Example Queries](#example-queries)
- [License](#license)

---

## Why This Tool Exists

Engineering documents contain rich structured data locked in formats that LLMs cannot directly consume:

- **DWG/DXF files** contain a structured entity database — equipment blocks with tagged attributes, named layers organized by discipline, and coordinate-based connectivity. This data is vastly richer than what survives in a PDF export, but requires specialized parsing.
- **PDFs of P&IDs** are flat renderings where layers are flattened, blocks become dumb geometry, and attribute associations are destroyed. Text layers may or may not be present. Vision-based analysis can recover some information, but at lower accuracy.
- **HAZOP and LOPA spreadsheets** contain structured risk data in tabular form, but column naming varies widely between organizations and studies.
- **Reports and procedures** in DOCX/TXT contain unstructured text that needs extraction and contextualization.

EngineeringDocs2LLM provides a unified ingestion pipeline that routes each format to the best available extractor, assembles the results into structured context, and delivers it to Claude with vision support for drawing analysis.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EngineeringDocs2LLM                              │
│                                                                         │
│  ┌───────────┐    ┌──────────────────────┐    ┌──────────────────────┐  │
│  │           │    │   EXTRACTION ENGINE   │    │    LLM GATEWAY       │  │
│  │  Web UI   │───▶│                      │───▶│                      │  │
│  │           │    │  ┌────────────────┐  │    │  Context Assembly     │  │
│  │ Upload    │    │  │ DXF Extractor  │  │    │  Vision Payload      │  │
│  │ Verify    │    │  │ (ezdxf)        │  │    │  API Proxy           │  │
│  │ Chat      │    │  ├────────────────┤  │    │  Response Handling    │  │
│  │           │    │  │ PDF Extractor  │  │    │                      │  │
│  └───────────┘    │  │ (pdfplumber +  │  │    └──────────┬───────────┘  │
│                   │  │  pdf2image)    │  │               │              │
│  static/          │  ├────────────────┤  │               │              │
│  index.html       │  │ XLSX/CSV       │  │               ▼              │
│                   │  │ (openpyxl +    │  │    ┌──────────────────────┐  │
│                   │  │  csv)          │  │    │   Anthropic API      │  │
│                   │  ├────────────────┤  │    │   Claude Sonnet      │  │
│                   │  │ DOCX/TXT       │  │    │   + Vision           │  │
│                   │  │ (python-docx)  │  │    └──────────────────────┘  │
│                   │  └────────────────┘  │                              │
│                   └──────────────────────┘                              │
│                                                                         │
│  server.py (Flask)                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

The system is a single-process Flask application with three logical layers:

**Web UI** (`static/index.html`) — A single HTML file with no build step. Handles file upload, extraction result display, and the LLM chat interface. Communicates with the server via REST API calls.

**Extraction Engine** (`extractors/`) — Format-specific Python modules that perform the actual parsing. Each extractor returns a standardized result dictionary with extracted data, statistics, and capability assessments.

**LLM Gateway** (`server.py /api/chat`) — Assembles extracted data from all uploaded documents into a structured context payload, constructs vision messages with rendered page images, and proxies the request to the Anthropic API.

---

## Data Flow Pipeline

```
                    ┌─────────────┐
                    │  User drops  │
                    │  file(s)     │
                    └──────┬──────┘
                           │
                           ▼
                  ┌────────────────┐
                  │ Format Router  │
                  │ (by extension) │
                  └───────┬────────┘
                          │
           ┌──────────────┼──────────────┬──────────────┐
           ▼              ▼              ▼              ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
     │ .dxf     │  │ .pdf     │  │.xlsx/.csv│  │.docx/.txt│
     │          │  │          │  │          │  │          │
     │ ezdxf    │  │pdfplumber│  │ openpyxl │  │python-doc│
     │ blocks   │  │ text     │  │  rows    │  │  text    │
     │ attrs    │  │ tables   │  │  headers │  │  tables  │
     │ layers   │  │          │  │          │  │          │
     │ connect. │  │pdf2image │  │          │  │          │
     │          │  │ renders  │  │          │  │          │
     └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
     ┌──────────────────────────────────────────────────────┐
     │              Unified Result Store (in-memory)         │
     │                                                       │
     │  { file_id, format, stats, equipment[], connections[],│
     │    pages[], full_text, headers[], rows[], ... }       │
     └───────────────────────────┬───────────────────────────┘
                                 │
                                 ▼
     ┌──────────────────────────────────────────────────────┐
     │              LLM Context Builder                      │
     │                                                       │
     │  DXF: Structured entity lists as formatted text       │
     │    → equipment tags, connections, layers, annotations │
     │                                                       │
     │  PDF: Extracted text + rendered page images            │
     │    → up to 8 pages as base64 PNG for vision           │
     │                                                       │
     │  XLSX/CSV: Column headers + first 30 rows as JSON     │
     │                                                       │
     │  DOCX/TXT: Full text content                          │
     └───────────────────────────┬───────────────────────────┘
                                 │
                                 ▼
     ┌──────────────────────────────────────────────────────┐
     │              Anthropic API (Claude Sonnet)            │
     │                                                       │
     │  System prompt: domain-specific process safety expert │
     │  User content: [images...] + user question            │
     │  Model: claude-sonnet-4-20250514 with vision          │
     └──────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Python 3.10 or higher
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

### Installation

```bash
# Clone or unzip the project
cd engdocs2llm

# Install Python dependencies
pip install -r requirements.txt

# Install the DXF parser (for CAD file support)
pip install ezdxf networkx

# Install poppler for PDF page rendering
# Windows: download from https://github.com/ossamamehmood/Poppler-windows/releases
#          extract and add the bin/ folder to your PATH
# Mac:     brew install poppler
# Linux:   sudo apt install poppler-utils
```

### Run

```bash
python server.py
```

Open **http://localhost:5000** in your browser. Enter your Anthropic API key in the settings bar at the top. Upload documents. Click **Extract & Analyze**. Ask Claude about your documents.

### One-Click Launchers

- **Windows:** Double-click `run.bat`
- **Mac/Linux:** `chmod +x run.sh && ./run.sh`

---

## Supported Formats & Extraction Capabilities

| Format | Extractor | Equipment Tags | Symbol ID | Connectivity | Tables | Text | Vision | Accuracy |
|--------|-----------|:-:|:-:|:-:|:-:|:-:|:-:|----------|
| **DXF** | ezdxf | ✅ Block attrs | ✅ Block defs | ✅ Coord match | — | ✅ TEXT/MTEXT | — | 90–100% |
| **DWG** | ODA → ezdxf | ✅ Block attrs | ✅ Block defs | ✅ Coord match | — | ✅ TEXT/MTEXT | — | 90–100% |
| **PDF** | pdfplumber + pdf2image | ⚠️ Text layer | ⚠️ Vision | ⚠️ Vision | ✅ Auto-detect | ✅ Text layer | ✅ Rendered | 70–90% |
| **XLSX/XLS** | openpyxl | — | — | — | ✅ Full parse | — | — | 100% |
| **CSV** | Python csv | — | — | — | ✅ Full parse | — | — | 100% |
| **DOCX** | python-docx | — | — | — | ✅ Embedded | ✅ Full text | — | 100% |
| **TXT** | Built-in | — | — | — | — | ✅ Full text | — | 100% |
| **PNG/JPG/TIFF** | Pillow | — | ⚠️ Vision | ⚠️ Vision | — | — | ✅ Direct | 60–75% |

**Legend:** ✅ = Fully supported — ⚠️ = Partial (depends on source quality) — = Not applicable

---

## DWG/DXF Ingestion Pipeline

This is the highest-value extraction pathway. DWG/DXF files contain a structured entity database that is dramatically richer than any PDF or vision-based approach.

### Why DXF Over PDF

When an engineer draws a pump symbol in AutoCAD, the DWG/DXF file stores a **block insert** with **attribute values** — the equipment tag, service description, and spec are explicit data fields. When they draw a pipe, it's a **polyline on a named layer** with associated text entities. All of this semantic structure is directly accessible via ezdxf.

When that same drawing is exported to PDF, all of this structure is destroyed. Layers flatten, blocks become dumb geometry, attributes become positioned text strings with no association to the symbols they label.

| Capability | DWG/DXF (Native) | PDF (Exported) |
|---|---|---|
| Equipment Tags | Block attributes — 100% accurate | Positioned text — must infer association by proximity |
| Layer Organization | Named layers: `P-EQUIP`, `I-INST`, etc. | Layers flattened — no discipline separation |
| Symbol Identity | Block definitions map to P&ID symbols | Geometry only — requires vision/CV for ID |
| Connectivity | Coordinate matching of endpoints | Must be inferred from visual intersection |
| Instrument Data | Block attributes: type, range, setpoint | Text labels only — no structured association |

### DXF Extraction Stages

```
 ┌──────────────────────────────────────────────────────────────┐
 │                    DXF Extraction Pipeline                    │
 │                                                               │
 │  Stage 1: Entity Scan                                        │
 │    msp.query("INSERT") → Block inserts with attributes       │
 │      For each INSERT:                                        │
 │        ├─ Resolve block_name (e.g., "PUMP_CENT_001")         │
 │        ├─ Extract ATTRIB values (TAG, SERVICE, SPEC)         │
 │        ├─ Record insertion point (x, y coordinates)          │
 │        └─ Classify by layer name (P-EQUIP → equipment)       │
 │                                                               │
 │  Stage 2: Layer Analysis                                     │
 │    doc.layers → Named layers with entity counts              │
 │      ├─ P-EQUIP, P-PIPE, P-VALVE   (process)                │
 │      ├─ I-INST, I-CTRL             (instrumentation)         │
 │      └─ E-ELEC                     (electrical)              │
 │                                                               │
 │  Stage 3: Connectivity Graph                                 │
 │    msp.query("LINE LWPOLYLINE") → Line endpoints            │
 │      ├─ Match endpoints to equipment within threshold        │
 │      ├─ Build: from_tag → to_tag connections                 │
 │      ├─ Deduplicate bidirectional links                      │
 │      └─ Optional: networkx graph for component analysis      │
 │                                                               │
 │  Stage 4: Annotations                                        │
 │    msp.query("TEXT MTEXT") → Text entities                   │
 │      └─ Spatial association to nearest equipment by coords   │
 │                                                               │
 │  Output: Structured JSON                                     │
 │    { equipment[], instruments[], connections[], layers{},     │
 │      annotations[], line_list[], graph{}, stats{} }          │
 └──────────────────────────────────────────────────────────────┘
```

### Equipment Classification

The extractor classifies entities by layer name and block name patterns:

| Layer Pattern | Block Pattern | Classified As |
|---|---|---|
| `P-EQUIP`, `EQUIP`, `P-VESSEL` | `PUMP`, `PMP` | pump |
| | `TANK`, `TK`, `VESSEL`, `DRUM` | vessel |
| | `HX`, `HEAT`, `EXCH` | heat_exchanger |
| | `COMP`, `BLOWER` | compressor |
| | `REACT`, `COLUMN`, `TOWER` | reactor_column |
| `I-`, `INST`, `INSTR` | `FCV`, `TCV`, `PCV` | control_valve |
| | *(other)* | instrument |
| `P-VALVE`, `VALVE` | — | valve |
| `P-PIPE`, `PIPING` | — | piping |
| `E-`, `ELEC` | — | electrical |

These patterns are configurable. Edit `classify_by_layer()` in `extractors/dxf_extractor.py` to match your CAD standards.

### DXF Extraction Output Schema

```json
{
  "equipment": [
    {
      "block_name": "PUMP_CENT_001",
      "layer": "P-EQUIP",
      "position": [145.2, 89.7],
      "attributes": { "TAG": "P-301A", "SERVICE": "EO Feed", "SPEC": "API 610" },
      "tag": "P-301A",
      "type": "pump"
    }
  ],
  "instruments": [
    {
      "block_name": "FCV_GLOBE",
      "layer": "I-CTRL",
      "position": [162.0, 89.5],
      "attributes": { "TAG": "FCV-1001", "SERVICE": "EO Flow Control" },
      "tag": "FCV-1001",
      "type": "control_valve"
    }
  ],
  "connections": [
    { "from": "TK-4401", "to": "P-301A", "line_layer": "P-PIPE" },
    { "from": "P-301A", "to": "E-4402", "line_layer": "P-PIPE" }
  ],
  "layers": {
    "P-EQUIP": { "name": "P-EQUIP", "color": 1, "entity_count": 47, "is_on": true },
    "I-INST":  { "name": "I-INST",  "color": 3, "entity_count": 32, "is_on": true }
  },
  "annotations": [
    {
      "text": "DESIGN PRESS: 150 PSIG",
      "position": [148.0, 95.0],
      "layer": "P-NOTE",
      "associated_equipment": "TK-4401"
    }
  ],
  "graph": {
    "nodes": ["TK-4401", "P-301A", "E-4402", "R-101"],
    "edges": [
      { "from": "TK-4401", "to": "P-301A", "layer": "P-PIPE" },
      { "from": "P-301A", "to": "E-4402", "layer": "P-PIPE" }
    ],
    "is_connected": true,
    "components": 1
  },
  "stats": {
    "total_entities": 847,
    "total_equipment": 14,
    "total_instruments": 23,
    "total_connections": 18,
    "total_layers": 31,
    "active_layers": 19,
    "dxf_version": "AC1032"
  }
}
```

### DWG File Support

DWG is Autodesk's proprietary binary format. Two options:

**Option A — Save as DXF (recommended for now):** In AutoCAD, File → Save As → select "AutoCAD DXF (*.dxf)". Upload the DXF file directly.

**Option B — ODA File Converter (automated):** Install the [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) (free for evaluation, ~$2,500/yr commercial). Set the `ODA_PATH` environment variable. DWG files will be auto-converted to DXF before extraction.

---

## PDF Processing Pipeline

PDFs are the second-best extraction pathway. The extractor combines text extraction, table detection, and full page rendering for Claude's vision analysis.

```
 ┌──────────────────────────────────────────────────────┐
 │               PDF Extraction Pipeline                 │
 │                                                       │
 │  Input: .pdf file                                     │
 │                    │                                   │
 │         ┌──────────┴──────────┐                       │
 │         ▼                     ▼                       │
 │  ┌─────────────┐     ┌──────────────┐                 │
 │  │ pdfplumber  │     │  pdf2image   │                 │
 │  │             │     │  (poppler)   │                 │
 │  │ Text per    │     │              │                 │
 │  │ page        │     │ Render at    │                 │
 │  │             │     │ 200 DPI      │                 │
 │  │ Table       │     │              │                 │
 │  │ detection   │     │ Base64 PNG   │                 │
 │  │             │     │ per page     │                 │
 │  │ Metadata    │     │              │                 │
 │  │             │     │ Thumbnails   │                 │
 │  └──────┬──────┘     └──────┬───────┘                 │
 │         │                   │                          │
 │         └─────────┬─────────┘                          │
 │                   ▼                                    │
 │  Combined Output:                                     │
 │    pages[].text          (extracted text per page)     │
 │    pages[].image_base64  (full-res render per page)    │
 │    pages[].thumbnail     (preview image)               │
 │    all_tables[]          (detected tables with rows)   │
 │    full_text             (concatenated text)            │
 │    stats                 (page count, text presence)    │
 └──────────────────────────────────────────────────────┘
```

**Text Layer:** If the PDF was exported from AutoCAD/MicroStation with text layers enabled, pdfplumber extracts equipment tags, line numbers, annotations, and notes.

**Table Detection:** pdfplumber auto-detects tabular regions, valuable for HAZOPs and LOPAs embedded in PDF reports.

**Page Rendering:** pdf2image renders every page at 200 DPI. These images are sent to Claude Vision as base64 PNG. Claude can visually analyze P&ID drawings even on PDFs without text layers.

**Accuracy note:** Vision-based P&ID analysis achieves approximately 70–80% on clean drawings. It is not a substitute for native DXF extraction.

---

## Tabular & Text Processing

**XLSX/XLS** — openpyxl parses all sheets. Returns headers, rows, and sheet names. Multi-sheet workbooks fully supported.

**CSV** — Python csv module with dialect auto-detection (comma, semicolon, tab, pipe delimiters). Headers from first row.

**DOCX** — python-docx extracts paragraphs (with style names) and embedded tables (with headers and rows).

**TXT** — Direct file read with UTF-8 encoding. Reports character count, line count, word count.

---

## LLM Integration & Vision

### Context Assembly

When the user sends a chat message, the server builds context from all extracted documents:

| Source Format | What the LLM Receives |
|---|---|
| DXF/DWG | Equipment list with tags, attributes, types. Connection graph (from → to). Active layers with counts. Annotations with spatial associations. Full stats. |
| PDF | Extracted text content. Detected tables. Up to 8 rendered page images as base64 PNG via Claude Vision. |
| XLSX/CSV | Column headers. First 30 rows as JSON dictionaries. |
| DOCX/TXT | Full text content (up to 6,000 chars). Embedded tables. |
| Images | Image as base64 PNG directly to Claude Vision. |

### System Prompt

The system prompt establishes Claude as a process safety engineering expert with specific instructions per document type: reference actual equipment tags from DXF data, describe what is visible in PDF renders (don't invent equipment), cite specific rows and values from spreadsheets, and flag limitations honestly.

### Vision Payload

On the first message in a chat session, rendered page images are included as base64 content blocks (up to 8 images). Subsequent messages are text-only — Claude retains visual context from the images already seen.

---

## API Reference

All endpoints served from `http://localhost:5000`.

### `GET /api/status`

System capabilities check. Returns whether ezdxf and pdfplumber are installed and how many files are currently extracted.

### `POST /api/upload`

Upload and extract a file. Auto-detects format and routes to the correct extractor. Accepts `multipart/form-data` with a `file` field. Returns the extraction result (base64 image data stripped from list responses).

### `GET /api/page_image/<file_id>/<page_num>`

Full-resolution rendered image for a specific PDF page. Returns `{"image_base64": "..."}`.

### `GET /api/thumbnail/<file_id>`

Thumbnail for a file (PDF first page or uploaded image).

### `GET /api/extracted`

List all extracted files with summary stats (no image data).

### `GET /api/extracted/<file_id>`

Full extraction data for a specific file (without base64 images).

### `POST /api/chat`

Send a query to Claude with all extracted document context.

**Request body:**
```json
{
  "api_key": "sk-ant-...",
  "message": "What equipment is shown in the P&ID?",
  "history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

**Response:**
```json
{
  "reply": "Based on the extracted DXF data, I can see 14 equipment items..."
}
```

The `history` array maintains conversation context. Images are included only on the first message (when history is empty).

### `GET /api/export/<file_id>`

Export extraction data as JSON. Writes to `outputs/` and returns the data.

### `POST /api/clear`

Clear all uploaded files and extracted data.

---

## Project Structure

```
engdocs2llm/
│
├── server.py                   # Flask application (525 lines)
│                               # Route handling, upload, format routing,
│                               # LLM context assembly, Anthropic API proxy
│
├── extractors/
│   ├── __init__.py
│   ├── dxf_extractor.py        # DXF/DWG via ezdxf (297 lines)
│   │                           # Block traversal, attribute extraction,
│   │                           # layer analysis, connectivity graph,
│   │                           # annotation spatial association
│   ├── pdf_extractor.py        # PDF via pdfplumber + pdf2image (146 lines)
│   │                           # Text per page, table detection,
│   │                           # page rendering at 200 DPI
│   └── tabular_extractor.py    # XLSX, CSV, DOCX, TXT (164 lines)
│                               # openpyxl, csv, python-docx
│
├── static/
│   └── index.html              # Single-file web UI (416 lines)
│                               # No build step, no npm, no bundler
│
├── uploads/                    # Uploaded files (auto-created)
├── outputs/                    # Exported JSON extractions
├── requirements.txt            # Python dependencies
├── .env.example                # Configuration template
├── run.bat                     # Windows launcher
├── run.sh                      # Mac/Linux launcher
└── README.md                   # This file
```

**Total codebase: ~1,550 lines.** No transpilation, no bundling, no build step.

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env`:

| Variable | Required | Description |
|----------|:--------:|-------------|
| `ODA_PATH` | No | Path to ODA File Converter executable for automatic DWG→DXF conversion |

### API Key

The Anthropic API key is entered in the browser UI and sent with each chat request. It is stored only in the browser tab's `window.name` for session persistence. It is never written to disk. The key is transmitted to the Anthropic API directly from your local server process.

### Tunable Parameters

| Parameter | Location | Default | Effect |
|-----------|----------|---------|--------|
| Port | `server.py` last line | 5000 | Server port |
| Max upload size | `server.py MAX_CONTENT_LENGTH` | 100 MB | Maximum file upload |
| Max PDF pages | `pdf_extractor.py max_pages` | 20 | Pages to process |
| Render DPI | `pdf_extractor.py render_dpi` | 200 | Image resolution for vision |
| Proximity threshold | `dxf_extractor.py proximity_threshold` | 10.0 | Drawing units for connectivity matching |
| LLM model | `server.py` chat route | claude-sonnet-4-20250514 | Claude model version |
| Max LLM tokens | `server.py` chat route | 2000 | Response length limit |

---

## Security Considerations

### What Stays Local

All uploaded files, all extracted data, and all intermediate processing remain on your machine.

### What Goes to Anthropic

The assembled text context and rendered page images are sent to the Claude API when you use the chat feature. This includes extracted equipment tags, connection data, text content, and page renders. Review the chat info bar to see exactly what will be sent.

### API Key Handling

The key is entered in the browser, sent to the local Flask server per request, and forwarded to Anthropic. Never stored on disk.

---

## Future Roadmap: Sensitivity Engine

The build requirements document describes a planned sensitivity engine with five redaction strategies:

```
 ┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
 │  Extracted    │     │  Sensitivity     │     │  Routing Gate    │
 │  Data         │────▶│  Transform       │────▶│                  │
 │              │     │                  │     │ residual_sens    │
 │  equipment[] │     │  Per-field:       │     │  <= INTERNAL     │
 │  connections[]│     │  • passthrough   │     │    → Cloud LLM   │
 │  text         │     │  • abstract      │     │  > INTERNAL      │
 │  tables       │     │  • tokenize      │     │    → On-Prem LLM │
 └──────────────┘     │  • redact        │     └──────────────────┘
                      │  • noise (±X%)   │
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │  Token Registry   │
                      │  (encrypted,      │
                      │   separate key,   │
                      │   never sent to   │
                      │   LLM endpoints)  │
                      └──────────────────┘
```

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Pass Through** | Keep original value | Public data (equipment types, deviation categories) |
| **Abstract** | Generic replacement (`TK-4401` → `UNIT-037`) | Internal identifiers |
| **Tokenize** | Reversible opaque token with secure registry | Confidential data needing post-analysis reversal |
| **Redact** | Full removal with `█████` placeholder | Restricted data (locations, personnel) |
| **Noise** | Perturb numerics within ±X% | Confidential process conditions |

Four sensitivity tiers (`PUBLIC` → `INTERNAL` → `CONFIDENTIAL` → `RESTRICTED`) with configurable presets: Minimal, Balanced, Max Safety, Full Lockdown.

This enables hybrid cloud/on-prem LLM routing based on residual sensitivity, with a separate encrypted token registry that never reaches any LLM endpoint.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError: ezdxf` | `pip install ezdxf`. Without it, DXF uploads return an error. Server still starts. |
| `ModuleNotFoundError: pdfplumber` | `pip install pdfplumber pdf2image Pillow` |
| PDF pages not rendering | Install poppler. Windows: download from GitHub, add `bin/` to PATH. Mac: `brew install poppler`. Linux: `sudo apt install poppler-utils` |
| API error 401 | Invalid API key. Check at console.anthropic.com |
| API error 429 | Rate limited. Wait and retry. |
| DWG shows "needs conversion" | Save as DXF from AutoCAD, or install ODA and set `ODA_PATH` |
| Port 5000 in use | Change port in `server.py` last line |
| DXF finds no equipment | Verify drawing uses attributed blocks. Adjust `proximity_threshold` for connections |
| Large PDF slow | Reduce `max_pages` or lower `render_dpi` |

---

## Example Queries

After uploading and extracting documents:

**For P&IDs (DXF):**
- *"List all equipment with their tags and types"*
- *"Trace the process flow from TK-4401 through the connectivity graph"*
- *"Which equipment has no outgoing connections?"*
- *"What instruments are present? Are there coverage gaps?"*

**For P&IDs (PDF with vision):**
- *"Describe the major process equipment visible in this drawing"*
- *"What control valves can you identify?"*
- *"Are there any unusual or missing P&ID symbols?"*

**For HAZOPs (XLSX/CSV):**
- *"Summarize the high-risk deviations (severity >= 4)"*
- *"Which scenarios have open recommendations?"*
- *"Are there missing guidewords for any nodes?"*

**For LOPAs (XLSX/CSV):**
- *"Verify the frequency calculations for each scenario"*
- *"Which scenarios have a gap between mitigated and target frequency?"*
- *"Are the IPL PFD values reasonable?"*

---

## License

Internal use. See accompanying `EngineeringDocs2LLM-Build-Requirements.docx` for full project specification.
