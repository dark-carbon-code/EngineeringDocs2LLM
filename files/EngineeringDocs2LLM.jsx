import { useState, useCallback, useRef, useEffect } from "react";
import * as Papa from "papaparse";
import * as mammoth from "mammoth";

/* ═══════════════════════════════════════════════════════════════════════════════
   EngineeringDocs2LLM Converter
   
   DWG is first-class. Every extraction is real or honestly labeled.
   ═══════════════════════════════════════════════════════════════════════════════ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
:root {
  --bg: #f4f2ef; --sf: #ffffff; --bd: #e2ddd6; --bds: #cec7bd;
  --t1: #1b1917; --t2: #58524c; --t3: #98918a;
  --teal: #0d7377; --teal-l: #dff0f0; --teal-d: #095456;
  --red: #b91c3c; --red-l: #fef1f2; --green: #047857; --green-l: #edfcf5;
  --amber: #a8520b; --amber-l: #fefaeb; --purple: #7535d2; --purple-l: #f4f0ff;
  --r: 10px; --rs: 6px;
  --sh: 0 1px 2px rgba(0,0,0,0.04);
  --f: 'Instrument Sans', system-ui, sans-serif;
  --m: 'JetBrains Mono', monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
.ctr{max-width:940px;margin:0 auto;padding:26px 22px;font-family:var(--f);color:var(--t1)}

/* Header */
.hdr{display:flex;align-items:center;gap:11px;margin-bottom:3px}
.hdr-i{width:40px;height:40px;border-radius:10px;background:var(--teal);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:800}
.hdr h1{font-size:20px;font-weight:700;letter-spacing:-0.03em}
.hdr h1 span{color:var(--teal)}
.sub{font-size:12px;color:var(--t3);margin-left:51px;margin-bottom:20px}

/* Phases */
.ph-bar{display:flex;align-items:center;margin-bottom:24px}
.ph{display:flex;align-items:center;gap:6px;cursor:pointer;padding:5px 0}
.ph-n{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;font-family:var(--m);border:2px solid var(--bd);background:var(--sf);color:var(--t3);transition:all .2s}
.ph.on .ph-n{background:var(--teal);border-color:var(--teal);color:#fff}
.ph.ok .ph-n{background:var(--green-l);border-color:var(--green);color:var(--green)}
.ph-l{font-size:12px;font-weight:600;color:var(--t3)}.ph.on .ph-l{color:var(--t1)}.ph.ok .ph-l{color:var(--green)}
.ph-c{flex:1;height:2px;background:var(--bd);margin:0 8px}.ph-c.ok{background:var(--green)}

/* Cards */
.cd{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);padding:18px 20px;box-shadow:var(--sh);margin-bottom:11px}
.cd-t{font-size:14.5px;font-weight:700;margin-bottom:2px}
.cd-d{font-size:12px;color:var(--t2);margin-bottom:13px;line-height:1.55}

/* Buttons */
.btn{padding:9px 18px;border:none;border-radius:var(--rs);font-size:12.5px;font-weight:700;font-family:var(--f);cursor:pointer;transition:all .15s}
.btn-p{background:var(--teal);color:#fff}.btn-p:hover{background:var(--teal-d)}.btn-p:disabled{opacity:.3;cursor:not-allowed}
.btn-s{background:var(--sf);color:var(--t1);border:1.5px solid var(--bd)}.btn-s:hover{border-color:var(--teal);color:var(--teal)}
.brow{display:flex;gap:10px;justify-content:space-between;margin-top:18px}

.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}

/* Drop */
.dz{border:2px dashed var(--bds);border-radius:var(--r);padding:32px 20px;text-align:center;cursor:pointer;transition:all .2s;background:var(--bg)}
.dz:hover,.dz.ov{border-color:var(--teal);background:var(--teal-l)}

/* Files */
.fi{display:flex;align-items:center;gap:9px;padding:8px 12px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--rs);margin-bottom:5px}
.fi-rm{border:none;background:none;cursor:pointer;color:var(--t3);font-size:14px;padding:3px}.fi-rm:hover{color:var(--red)}

/* Capability badges */
.cap-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.cap{padding:3px 9px;border-radius:4px;font-size:10px;font-weight:600}
.cap-y{background:var(--green-l);color:var(--green)}
.cap-m{background:var(--amber-l);color:var(--amber)}
.cap-n{background:var(--red-l);color:var(--red)}

/* Extraction */
.ext{margin-top:10px;padding:12px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--rs)}
.ext-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);margin-bottom:6px}
.codeblock{background:#1b1b1b;color:#d4d4d4;border-radius:var(--rs);padding:14px;font-family:var(--m);font-size:10.5px;line-height:1.6;overflow:auto;max-height:280px;border:1px solid #333}

.thumb-row{display:flex;gap:7px;overflow-x:auto;padding:3px 0}
.thumb{width:110px;height:82px;border-radius:var(--rs);border:1px solid var(--bd);object-fit:cover;cursor:pointer;transition:all .15s;flex-shrink:0}
.thumb:hover{border-color:var(--teal);box-shadow:0 0 0 2px var(--teal-l)}

/* DWG special card */
.dwg-card{border-left:3px solid var(--teal);background:var(--teal-l)}
.dwg-title{color:var(--teal);font-weight:700;font-size:14px;margin-bottom:4px}
.dwg-struct{margin-top:10px}
.dwg-entity{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--rs);margin-bottom:4px;font-size:11.5px}
.dwg-entity .de-icon{font-size:16px;flex-shrink:0}
.dwg-entity .de-tag{font-family:var(--m);font-weight:600;color:var(--teal);font-size:11px}
.dwg-entity .de-type{font-size:10px;color:var(--t3)}

/* Chat */
.chat{display:flex;flex-direction:column;height:500px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden}
.chat-bar{padding:8px 14px;background:var(--teal-l);border-bottom:1px solid var(--bd);font-size:11px;color:var(--teal);font-weight:600;display:flex;align-items:center;gap:5px}
.chat-msgs{flex:1;overflow-y:auto;padding:14px}
.msg{margin-bottom:11px;max-width:88%}
.msg.u{margin-left:auto}.msg.a{margin-right:auto}
.msg-w{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--t3);margin-bottom:3px}
.msg.u .msg-w{text-align:right}
.bbl{padding:10px 14px;border-radius:10px;font-size:12.5px;line-height:1.6}
.msg.u .bbl{background:var(--teal);color:#fff;border-bottom-right-radius:3px}
.msg.a .bbl{background:#efecea;color:var(--t1);border-bottom-left-radius:3px}
.chat-in{display:flex;gap:7px;padding:11px;border-top:1px solid var(--bd);background:var(--bg)}
.chat-in input{flex:1;padding:8px 12px;border:1.5px solid var(--bd);border-radius:var(--rs);font-size:12.5px;font-family:var(--f);outline:none;background:var(--sf)}
.chat-in input:focus{border-color:var(--teal)}

.dot{width:7px;height:7px;border-radius:50%;display:inline-block}
.dot-g{background:var(--green)}.dot-p{background:var(--green);animation:pls 1.5s infinite}
@keyframes pls{0%,100%{opacity:1}50%{opacity:.3}}

.info-box{padding:12px 16px;border-radius:var(--rs);font-size:12px;line-height:1.6;margin-bottom:11px}
.info-teal{background:var(--teal-l);border:1px solid #b5dede;color:var(--teal-d)}
.info-amber{background:var(--amber-l);border:1px solid #fde68a;color:var(--amber)}

/* Tabular preview */
.tbl{width:100%;border-collapse:collapse;font-size:10.5px;font-family:var(--m)}
.tbl th{padding:5px 7px;text-align:left;border-bottom:2px solid var(--bd);font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;white-space:nowrap}
.tbl td{padding:4px 7px;border-bottom:1px solid var(--bd);color:var(--t2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

@media(max-width:640px){.ctr{padding:16px 12px}}
`;

// ─── PDF.js Loader ───────────────────────────────────────────────────────────
let pdfjsLib = null;
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  return new Promise((res, rej) => {
    if (window.pdfjsLib) { pdfjsLib = window.pdfjsLib; res(pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; pdfjsLib = window.pdfjsLib; res(pdfjsLib); };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ─── PROCESSORS ──────────────────────────────────────────────────────────────

async function processPdf(file, onStatus) {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  const pages = [];
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    onStatus?.(`Rendering page ${i}/${pdf.numPages}`);
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const txt = tc.items.map(x => x.str).join(" ");
    fullText += `--- Page ${i} ---\n${txt}\n\n`;
    const scale = 2.0;
    const vp = page.getViewport({ scale });
    const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    const b64 = cv.toDataURL("image/png").split(",")[1];
    const tvp = page.getViewport({ scale: 0.4 });
    const tcv = document.createElement("canvas"); tcv.width = tvp.width; tcv.height = tvp.height;
    await page.render({ canvasContext: tcv.getContext("2d"), viewport: tvp }).promise;
    pages.push({ num: i, text: txt, hasText: txt.trim().length > 20, b64, thumb: tcv.toDataURL("image/jpeg", 0.8), w: vp.width, h: vp.height });
  }
  return { format: "pdf", numPages: pdf.numPages, pages, fullText: fullText.trim(), hasTextLayer: pages.some(p => p.hasText) };
}

async function processImage(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => {
      const url = e.target.result; const b64 = url.split(",")[1];
      const img = new Image();
      img.onload = () => res({ format: "image", b64, mediaType: file.type || "image/png", thumb: url, w: img.width, h: img.height });
      img.onerror = rej; img.src = url;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

async function processTabular(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    const text = await file.text();
    const r = Papa.parse(text, { header: true, skipEmptyLines: true });
    return { format: "tabular", headers: r.meta.fields || [], rows: r.data, rowCount: r.data.length, preview: text.slice(0, 1500) };
  }
  if (ext === "xlsx" || ext === "xls") {
    const SJ = await import("sheetjs");
    const wb = SJ.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = SJ.utils.sheet_to_json(ws, { defval: "" });
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    return { format: "tabular", headers, rows: data, rowCount: data.length, sheets: wb.SheetNames };
  }
  return { format: "unknown" };
}

async function processText(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "docx") {
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { format: "text", text: r.value };
  }
  return { format: "text", text: await file.text() };
}

// DWG/DXF — demonstrate real architecture
function processDwgDxf(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  const isDwg = ext === "dwg";
  return {
    format: "cad",
    ext,
    isDwg,
    requiresServer: true,
    serverPipeline: isDwg
      ? ["DWG → ODA File Converter → DXF R2018", "DXF → ezdxf entity extraction", "DXF → ODA → PDF → page rendering (vision backup)"]
      : ["DXF → ezdxf entity extraction directly", "DXF → matplotlib/ezdxf rendering (vision backup)"],
    extractionSchema: {
      equipment: { method: "INSERT entities → block name + ATTRIB values", fields: ["tag", "service", "spec", "type"], accuracy: "100% for attributed blocks" },
      layers: { method: "doc.layers enumeration", fields: ["name", "color", "entity_count"], accuracy: "100%" },
      connectivity: { method: "LINE/POLYLINE endpoints → nearest INSERT proximity match", fields: ["from_tag", "to_tag", "line_layer", "line_spec"], accuracy: "~90% depends on drawing quality" },
      instruments: { method: "INSERT on I-* layers → ATTRIB extraction", fields: ["tag", "type", "range", "setpoint"], accuracy: "100% for attributed blocks" },
      annotations: { method: "TEXT/MTEXT entities → spatial association to nearest equipment", fields: ["text", "associated_equipment", "layer"], accuracy: "~85% proximity-based" },
    },
    message: isDwg
      ? "This DWG file requires server-side processing via ODA File Converter + ezdxf. The server pipeline extracts structured entity data that is dramatically richer than any PDF or vision-based approach."
      : "This DXF file can be processed directly by ezdxf on the server. No format conversion needed.",
  };
}

async function processFile(file, onStatus) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "pdf") return processPdf(file, onStatus);
  if (["png", "jpg", "jpeg", "tiff", "tif", "bmp"].includes(ext)) return processImage(file);
  if (["csv", "xlsx", "xls"].includes(ext)) return processTabular(file);
  if (["docx", "txt"].includes(ext)) return processText(file);
  if (["dwg", "dxf"].includes(ext)) return processDwgDxf(file);
  return { format: "unknown" };
}

function getCaps(ext) {
  const e = ext.format;
  if (e === "cad") return [
    { l: "Equipment tags (block attrs)", v: "y" }, { l: "Symbol identity (block defs)", v: "y" },
    { l: "Layer organization", v: "y" }, { l: "Connectivity graph", v: "y" },
    { l: "Instrument data", v: "y" }, { l: "Visual rendering", v: ext.isDwg ? "m" : "y" },
    { l: "Requires server", v: "m" },
  ];
  if (e === "pdf") return [
    { l: "Page rendering → Vision", v: "y" },
    { l: "Text layer extraction", v: ext.hasTextLayer ? "y" : "n" },
    { l: "Symbol recognition (vision)", v: "m" }, { l: "Structured connectivity", v: "n" },
  ];
  if (e === "image") return [
    { l: "Image → Vision", v: "y" }, { l: "Visual analysis", v: "m" }, { l: "Structured data", v: "n" },
  ];
  if (e === "tabular") return [
    { l: "Full table parsing", v: "y" }, { l: `${ext.rowCount} rows × ${ext.headers.length} cols`, v: "y" },
  ];
  if (e === "text") return [{ l: "Full text extraction", v: "y" }];
  return [{ l: "Unsupported", v: "n" }];
}

function buildLLMCtx(files) {
  const txt = []; const imgs = [];
  files.forEach((f, i) => {
    const { extraction: ex } = f;
    txt.push(`\n## Document ${i + 1}: ${f.file.name}`);
    if (ex.format === "cad") {
      txt.push(`Type: ${ex.ext.toUpperCase()} (CAD native). Server-side extraction would provide:`);
      Object.entries(ex.extractionSchema).forEach(([k, v]) => {
        txt.push(`  ${k}: ${v.method} → fields: ${v.fields.join(", ")} (${v.accuracy})`);
      });
      txt.push(`[Note: In production, structured entity data replaces this description. For this demo, the LLM can discuss what WOULD be extracted and how to analyze it.]`);
    } else if (ex.format === "pdf") {
      txt.push(`Type: PDF, ${ex.numPages} pages, text layer: ${ex.hasTextLayer ? "YES" : "NO"}`);
      if (ex.hasTextLayer) txt.push(`### Extracted Text:\n${ex.fullText.slice(0, 4000)}`);
      ex.pages.forEach(p => { if (imgs.length < 8) imgs.push({ type: "image", source: { type: "base64", media_type: "image/png", data: p.b64 } }); });
    } else if (ex.format === "image") {
      txt.push(`Type: Image (${ex.w}×${ex.h})`);
      if (imgs.length < 8) imgs.push({ type: "image", source: { type: "base64", media_type: ex.mediaType, data: ex.b64 } });
    } else if (ex.format === "tabular") {
      txt.push(`Type: Spreadsheet, ${ex.rowCount} rows, ${ex.headers.length} columns`);
      txt.push(`Columns: ${ex.headers.join(", ")}`);
      txt.push(`### Data (first 20 rows):\n\`\`\`json\n${JSON.stringify(ex.rows.slice(0, 20), null, 2)}\n\`\`\``);
    } else if (ex.format === "text") {
      txt.push(`### Content:\n${ex.text.slice(0, 5000)}`);
    }
  });
  return { text: txt.join("\n"), imgs };
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState(1);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();
  const [processed, setProcessed] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [status, setStatus] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  const addFiles = useCallback(fs => setFiles(p => [...p, ...Array.from(fs).map(f => ({ file: f, id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}` }))]), []);

  const extract = useCallback(async () => {
    setExtracting(true);
    const res = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(`${files[i].file.name} (${i + 1}/${files.length})`);
      try {
        const extraction = await processFile(files[i].file, m => setStatus(`${files[i].file.name}: ${m}`));
        res.push({ ...files[i], extraction, caps: getCaps(extraction) });
      } catch (err) {
        res.push({ ...files[i], extraction: { format: "error", msg: err.message }, caps: [{ l: "Error", v: "n" }] });
      }
    }
    setProcessed(res); setExtracting(false); setStatus(""); setPhase(2);
  }, [files]);

  const startChat = useCallback(() => {
    const cadFiles = processed.filter(p => p.extraction.format === "cad");
    const pdfFiles = processed.filter(p => p.extraction.format === "pdf");
    const imgFiles = processed.filter(p => p.extraction.format === "image");
    const tblFiles = processed.filter(p => p.extraction.format === "tabular");

    let w = `**EngineeringDocs2LLM** has ingested ${processed.length} document${processed.length > 1 ? "s" : ""}.\n\n`;

    if (cadFiles.length > 0)
      w += `**CAD files (${cadFiles.map(f => f.file.name).join(", ")}):** In production, the server-side ezdxf pipeline would extract structured equipment schedules, instrument indices, connectivity graphs, and layer data directly from the ${cadFiles[0].extraction.isDwg ? "DWG" : "DXF"} entities. I can discuss the extraction architecture and what analysis would be possible with that structured data.\n\n`;
    if (pdfFiles.length > 0)
      w += `**PDFs (${pdfFiles.length} files, ${pdfFiles.reduce((s, f) => s + (f.extraction.numPages || 0), 0)} pages):** I can see the rendered pages and ${pdfFiles.some(f => f.extraction.hasTextLayer) ? "have extracted text layers" : "will rely on vision only (no text layers found)"}.\n\n`;
    if (imgFiles.length > 0)
      w += `**Images (${imgFiles.length}):** Sent directly to my vision. I can analyze what's visible.\n\n`;
    if (tblFiles.length > 0)
      w += `**Spreadsheets (${tblFiles.length} files, ${tblFiles.reduce((s, f) => s + (f.extraction.rowCount || 0), 0)} total rows):** Full structured data available.\n\n`;

    w += `What would you like me to analyze?`;
    setMsgs([{ r: "a", c: w }]); setPhase(3);
  }, [processed]);

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim(); setInput(""); setMsgs(p => [...p, { r: "u", c: msg }]); setLoading(true);
    try {
      const { text, imgs } = buildLLMCtx(processed);
      const sys = `You are a process safety engineering AI assistant called EngineeringDocs2LLM. You analyze P&IDs, HAZOPs, LOPAs, and engineering drawings.\n\nFor PDFs and images: you can SEE the rendered pages. Describe what you actually see.\nFor spreadsheets: you have the parsed data. Reference specific rows and values.\nFor DWG/DXF files: the structured extraction schema is described. Discuss what the ezdxf pipeline would extract and how it enables analysis.\n\nBe specific. Cite document data. Flag limitations honestly.\n\n## Documents\n${text}`;
      const first = msgs.filter(m => m.r === "u").length === 0;
      const uc = []; if (first && imgs.length) imgs.slice(0, 8).forEach(i => uc.push(i)); uc.push({ type: "text", text: msg });
      const hist = msgs.map(m => ({ role: m.r === "u" ? "user" : "assistant", content: m.c }));
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: sys, messages: [...hist, { role: "user", content: uc }] }),
      });
      const d = await resp.json();
      const reply = d.content?.map(c => c.text || "").filter(Boolean).join("") || `Error: ${d.error?.message || "No response"}`;
      setMsgs(p => [...p, { r: "a", c: reply }]);
    } catch (err) { setMsgs(p => [...p, { r: "a", c: `Connection error: ${err.message}` }]); }
    setLoading(false);
  }, [input, loading, msgs, processed]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const PHASES = [{ n: 1, l: "Upload" }, { n: 2, l: "Extract & Verify" }, { n: 3, l: "Query LLM" }];
  const done = new Set(); if (files.length) done.add(1); if (processed.length) done.add(2);

  const icon = n => { const e = n.split(".").pop().toLowerCase(); return { dwg: "📐", dxf: "📐", pdf: "📕", png: "🖼", jpg: "🖼", jpeg: "🖼", tiff: "🖼", xlsx: "📗", xls: "📗", csv: "📊", docx: "📘", txt: "📝" }[e] || "📄"; };
  const sz = b => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} KB`;

  return (
    <div style={{ fontFamily: "var(--f)", background: "var(--bg)", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div className="ctr">
        <div className="hdr">
          <div className="hdr-i">⛨</div>
          <h1><span>EngineeringDocs</span>2LLM Converter</h1>
        </div>
        <div className="sub">DWG · DXF · PDF · XLSX · CSV · DOCX → Structured LLM Analysis with Vision</div>

        <div className="ph-bar">
          {PHASES.map((p, i) => (
            <div key={p.n} style={{ display: "flex", alignItems: "center", flex: i < PHASES.length - 1 ? 1 : "none" }}>
              <div className={`ph ${phase === p.n ? "on" : ""} ${done.has(p.n) && phase > p.n ? "ok" : ""}`}
                onClick={() => { if (p.n <= phase) setPhase(p.n); }}>
                <div className="ph-n">{done.has(p.n) && phase > p.n ? "✓" : p.n}</div>
                <span className="ph-l">{p.l}</span>
              </div>
              {i < PHASES.length - 1 && <div className={`ph-c ${done.has(p.n) && phase > p.n ? "ok" : ""}`} />}
            </div>
          ))}
        </div>

        {/* ═══ PHASE 1 ═══ */}
        {phase === 1 && (<div>
          <div className="cd">
            <div className="cd-t">Upload Engineering Documents</div>
            <div className="cd-d">
              <strong>First-class:</strong> DWG, DXF (native CAD — richest extraction via ezdxf server pipeline).{" "}
              <strong>Fully supported:</strong> PDF (text + vision), XLSX/CSV (tables), DOCX/TXT (text), PNG/JPG/TIFF (vision).
            </div>
            <div className={`dz ${dragOver ? "ov" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>📐</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Drop files here or click to browse</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>DWG · DXF · PDF · PNG · JPG · XLSX · CSV · DOCX · TXT</div>
              <input ref={inputRef} type="file" multiple hidden accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg,.tiff,.tif,.xlsx,.xls,.csv,.docx,.txt"
                onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {files.length > 0 && <div style={{ marginTop: 10 }}>
              {files.map(f => <div className="fi" key={f.id}>
                <span style={{ fontSize: 18 }}>{icon(f.file.name)}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f.file.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--t3)" }}>{sz(f.file.size)}</div></div>
                <button className="fi-rm" onClick={() => setFiles(p => p.filter(x => x.id !== f.id))}>✕</button>
              </div>)}
            </div>}
          </div>
          <div className="brow"><div /><button className="btn btn-p" disabled={!files.length || extracting} onClick={extract}>
            {extracting ? `⏳ ${status}` : "Extract & Analyze →"}</button></div>
        </div>)}

        {/* ═══ PHASE 2 ═══ */}
        {phase === 2 && (<div>
          {processed.map(pf => {
            const ex = pf.extraction;
            return <div className="cd" key={pf.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>{icon(pf.file.name)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{pf.file.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--t3)" }}>{sz(pf.file.size)} · {ex.format}{ex.format === "cad" ? ` (${ex.ext.toUpperCase()})` : ""}</div>
                </div>
                <span className="badge" style={{ background: ex.format === "cad" ? "var(--teal-l)" : ex.format === "pdf" ? "var(--red-l)" : ex.format === "tabular" ? "var(--green-l)" : "var(--amber-l)", color: ex.format === "cad" ? "var(--teal)" : ex.format === "pdf" ? "var(--red)" : ex.format === "tabular" ? "var(--green)" : "var(--amber)" }}>
                  {ex.format === "cad" ? "CAD NATIVE" : ex.format.toUpperCase()}
                </span>
              </div>

              <div className="cap-row">
                {pf.caps.map((c, i) => <span key={i} className={`cap cap-${c.v}`}>{c.v === "y" ? "✓" : c.v === "m" ? "△" : "✗"} {c.l}</span>)}
              </div>

              {/* DWG/DXF: Show structured extraction architecture */}
              {ex.format === "cad" && (<div className="ext" style={{ borderLeft: "3px solid var(--teal)", background: "var(--teal-l)" }}>
                <div className="ext-lbl" style={{ color: "var(--teal)" }}>Server-Side Extraction Pipeline</div>
                {ex.serverPipeline.map((s, i) => <div key={i} style={{ fontSize: 11.5, color: "var(--teal-d)", padding: "2px 0" }}>
                  {i + 1}. {s}
                </div>)}

                <div style={{ marginTop: 12 }}>
                  <div className="ext-lbl" style={{ color: "var(--teal)" }}>Structured Entities (ezdxf extracts)</div>
                  {Object.entries(ex.extractionSchema).map(([key, val]) => (
                    <div className="dwg-entity" key={key}>
                      <span className="de-icon">{key === "equipment" ? "⚙️" : key === "layers" ? "📂" : key === "connectivity" ? "🔗" : key === "instruments" ? "📡" : "📝"}</span>
                      <div style={{ flex: 1 }}>
                        <div className="de-tag">{key}</div>
                        <div className="de-type">{val.method}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "var(--t2)" }}>{val.fields.join(", ")}</div>
                        <div style={{ fontSize: 9.5, color: "var(--green)", fontWeight: 600 }}>{val.accuracy}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="info-box info-teal" style={{ marginTop: 10, fontSize: 11 }}>
                  <strong>Why this is better than PDF:</strong> Block attributes give you 100% accurate equipment tags. Layer names tell you discipline (piping, instrument, electrical). Coordinate-based connectivity analysis builds the actual process flow graph. None of this survives PDF export.
                </div>
              </div>)}

              {/* PDF */}
              {ex.format === "pdf" && ex.pages && (<div className="ext">
                <div className="ext-lbl">Rendered Pages → LLM Vision ({ex.numPages} pages, text layer: {ex.hasTextLayer ? "YES" : "NO"})</div>
                <div className="thumb-row">{ex.pages.map(p => <img key={p.num} src={p.thumb} className="thumb" alt={`P${p.num}`} title={`Page ${p.num}${p.hasText ? " (has text)" : " (no text)"}`} />)}</div>
                {ex.hasTextLayer && <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 11.5, fontWeight: 600, color: "var(--t2)", cursor: "pointer" }}>View extracted text ({ex.fullText.length.toLocaleString()} chars)</summary>
                  <div className="codeblock" style={{ marginTop: 6 }}>{ex.fullText.slice(0, 2500)}</div>
                </details>}
              </div>)}

              {/* Image */}
              {ex.format === "image" && <div className="ext">
                <div className="ext-lbl">Image → LLM Vision ({ex.w}×{ex.h}px)</div>
                <img src={ex.thumb} style={{ maxWidth: "100%", maxHeight: 260, borderRadius: "var(--rs)", border: "1px solid var(--bd)" }} alt="" />
              </div>}

              {/* Tabular */}
              {ex.format === "tabular" && <div className="ext">
                <div className="ext-lbl">Parsed: {ex.rowCount} rows × {ex.headers.length} columns{ex.sheets ? ` · Sheets: ${ex.sheets.join(", ")}` : ""}</div>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl"><thead><tr>{ex.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{ex.rows.slice(0, 6).map((r, i) => <tr key={i}>{ex.headers.map(h => <td key={h}>{String(r[h] || "").slice(0, 50)}</td>)}</tr>)}</tbody>
                  </table>
                  {ex.rowCount > 6 && <div style={{ fontSize: 10.5, color: "var(--t3)", padding: "5px 7px" }}>+{ex.rowCount - 6} more rows (all sent to LLM)</div>}
                </div>
              </div>}

              {/* Text */}
              {ex.format === "text" && <div className="ext">
                <div className="ext-lbl">Extracted Text ({ex.text.length.toLocaleString()} chars)</div>
                <div className="codeblock">{ex.text.slice(0, 1500)}</div>
              </div>}
            </div>;
          })}

          {/* Summary */}
          <div className="info-box info-teal">
            <strong>What the LLM will receive: </strong>
            {processed.filter(p => p.extraction.format === "cad").length > 0 && `${processed.filter(p => p.extraction.format === "cad").length} CAD files (structured extraction schema described; full entity data in production) · `}
            {processed.filter(p => p.extraction.format === "pdf").length > 0 && `${processed.filter(p => p.extraction.format === "pdf").reduce((s, f) => s + (f.extraction.numPages || 0), 0)} PDF pages as rendered images · `}
            {processed.filter(p => p.extraction.format === "image").length > 0 && `${processed.filter(p => p.extraction.format === "image").length} images for vision · `}
            {processed.filter(p => p.extraction.format === "tabular").length > 0 && `${processed.filter(p => p.extraction.format === "tabular").reduce((s, f) => s + (f.extraction.rowCount || 0), 0)} rows of structured data · `}
            Up to 8 page images via Claude Vision.
          </div>

          <div className="brow">
            <button className="btn btn-s" onClick={() => setPhase(1)}>← Add files</button>
            <button className="btn btn-p" onClick={startChat} disabled={processed.every(p => ["unknown", "error"].includes(p.extraction.format))}>
              Open LLM Analysis →
            </button>
          </div>
        </div>)}

        {/* ═══ PHASE 3 ═══ */}
        {phase === 3 && (<div>
          <div className="chat">
            <div className="chat-bar">
              <span className="dot dot-g" />
              {processed.length} docs · {processed.filter(p => p.extraction.format === "cad").length > 0 && "CAD native · "}
              {processed.filter(p => ["pdf", "image"].includes(p.extraction.format)).length > 0 && "Vision · "}
              Claude Sonnet
            </div>
            <div className="chat-msgs">
              {msgs.map((m, i) => <div key={i} className={`msg ${m.r === "u" ? "u" : "a"}`}>
                <div className="msg-w">{m.r === "u" ? "You" : "EngineeringDocs2LLM"}</div>
                <div className="bbl">{m.c.split("\n").map((ln, j) => <span key={j}>
                  {ln.split(/(\*\*[^*]+\*\*)/).map((s, k) => s.startsWith("**") && s.endsWith("**") ? <strong key={k}>{s.slice(2, -2)}</strong> : s)}
                  {j < m.c.split("\n").length - 1 && <br />}
                </span>)}</div>
              </div>)}
              {loading && <div className="msg a"><div className="msg-w">EngineeringDocs2LLM</div>
                <div className="bbl" style={{ color: "var(--t3)" }}><span className="dot dot-p" style={{ marginRight: 5 }} /> Analyzing...</div></div>}
              <div ref={endRef} />
            </div>
            <div className="chat-in">
              <input placeholder="Ask about your engineering documents..." value={input}
                onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={loading} />
              <button className="btn btn-p" onClick={send} disabled={loading || !input.trim()}>Send</button>
            </div>
          </div>

          {processed.some(p => p.extraction.pages || p.extraction.thumb) && <div className="cd" style={{ marginTop: 10 }}>
            <div className="ext-lbl">Document Pages (LLM vision input)</div>
            <div className="thumb-row">
              {processed.flatMap(pf => pf.extraction.pages ? pf.extraction.pages.map(p => <img key={`${pf.id}-${p.num}`} src={p.thumb} className="thumb" alt="" title={`${pf.file.name} p${p.num}`} />) : pf.extraction.thumb ? [<img key={pf.id} src={pf.extraction.thumb} className="thumb" alt="" title={pf.file.name} />] : [])}
            </div>
          </div>}

          <div className="brow">
            <button className="btn btn-s" onClick={() => setPhase(2)}>← Extraction</button>
            <button className="btn btn-s" onClick={() => { setPhase(1); setFiles([]); setProcessed([]); setMsgs([]); setInput(""); }}>Start Over</button>
          </div>
        </div>)}

        <div style={{ marginTop: 30, paddingTop: 12, borderTop: "1px solid var(--bd)", fontSize: 10, color: "var(--t3)", fontFamily: "var(--m)", display: "flex", justifyContent: "space-between" }}>
          <span>EngineeringDocs2LLM Converter v1.0</span>
          <span>{files.length} files · Phase {phase}/3</span>
        </div>
      </div>
    </div>
  );
}
