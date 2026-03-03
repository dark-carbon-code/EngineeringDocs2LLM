# EngineeringDocs2LLM Converter

Converts engineering documents (DWG, DXF, PDF, XLSX, CSV, DOCX) into structured data and enables LLM-powered analysis with Claude Vision.

## Quick Start (3 steps)

### 1. Install Python

If you don't have Python 3.10+, download from https://www.python.org/downloads/

Verify:
```
python --version
```

### 2. Install Dependencies

Open a terminal in this folder and run:

```
pip install -r requirements.txt
```

**For DXF files** (P&IDs saved as DXF from AutoCAD):
```
pip install ezdxf networkx
```

**For PDF rendering** (page images sent to Claude Vision):
```
pip install pdfplumber pdf2image Pillow
```

Also install poppler for PDF page rendering:
- **Windows:** Download from https://github.com/ossamamehmood/Poppler-windows/releases and add `bin/` folder to your PATH
- **Mac:** `brew install poppler`  
- **Linux:** `sudo apt install poppler-utils`

### 3. Run

**Windows:** Double-click `run.bat`

**Mac/Linux:**
```
chmod +x run.sh
./run.sh
```

**Or manually:**
```
python server.py
```

Then open http://localhost:5000 in your browser.

## Enter Your API Key

In the web UI, paste your Anthropic API key in the top bar. Get one at https://console.anthropic.com/

The key stays in your browser tab only — it is sent to the Anthropic API directly from your server. It is never stored on disk.

## What It Actually Does

| Format | What gets extracted | How |
|--------|-------------------|-----|
| **DXF** | Equipment tags, block attributes, layer organization, connectivity graph, instruments, annotations | ezdxf parses the entity database directly — 100% accuracy on attributed blocks |
| **DWG** | Same as DXF after conversion | Requires ODA File Converter (see below). Without it, save as DXF from AutoCAD |
| **PDF** | Text content, tables, rendered page images | pdfplumber extracts text/tables; pdf2image renders pages; Claude Vision analyzes the images |
| **XLSX/CSV** | Full tabular data with headers | openpyxl / Python csv — 100% fidelity |
| **DOCX/TXT** | Full text and embedded tables | python-docx / plain read |
| **PNG/JPG/TIFF** | Image sent to Claude Vision | Direct base64 encoding |

## DWG Support

DWG is Autodesk's proprietary format. Two options:

**Option A (Recommended):** Save as DXF from AutoCAD before uploading.
- In AutoCAD: File → Save As → select "AutoCAD DXF (*.dxf)"
- Upload the DXF file — ezdxf extracts everything natively

**Option B:** Install the ODA File Converter for automatic DWG→DXF conversion.
1. Download from https://www.opendesign.com/guestfiles/oda_file_converter
2. Install it
3. Copy `.env.example` to `.env` and set ODA_PATH to the converter executable
4. DWG files will be auto-converted on upload

## Project Structure

```
engdocs2llm/
├── server.py                 # Flask server — all API routes
├── extractors/
│   ├── dxf_extractor.py      # ezdxf-based DXF/DWG entity extraction
│   ├── pdf_extractor.py      # pdfplumber text/table + pdf2image rendering
│   └── tabular_extractor.py  # XLSX, CSV, DOCX, TXT parsing
├── static/
│   └── index.html            # Single-file frontend (no build step)
├── uploads/                  # Uploaded files (auto-created)
├── outputs/                  # Exported JSON extractions
├── requirements.txt          # Python dependencies
├── .env.example              # Configuration template
├── run.bat                   # Windows launcher
├── run.sh                    # Mac/Linux launcher
└── README.md                 # This file
```

## What to Ask the LLM

After uploading and extracting your documents, try:

**For P&IDs (DXF/PDF):**
- "List all equipment and their tags"
- "Describe the process flow from the connectivity graph"
- "What instruments are associated with each vessel?"
- "Are there any equipment items with no connections?"
- "What safety devices are present? Are there gaps?"

**For HAZOPs (XLSX/CSV):**
- "Summarize the deviations and their risk rankings"
- "Which scenarios have severity >= 4 with inadequate safeguards?"
- "Are there missing deviations for common guidewords?"

**For LOPAs (XLSX/CSV):**
- "Verify the frequency calculations for each scenario"
- "Which scenarios have gaps between mitigated and target frequency?"
- "Are the IPL PFD values reasonable?"

## Troubleshooting

**"ezdxf not installed"** → Run `pip install ezdxf`

**PDF pages not rendering** → Install poppler (see step 2 above)

**"API error 401"** → Check your Anthropic API key is correct

**DWG files showing "needs conversion"** → Save as DXF from AutoCAD, or install ODA converter

**Port 5000 already in use** → Edit server.py last line to change the port number
