import { useState, useRef, useCallback } from "react";

const API_URL = "https://api.anthropic.com/v1/messages";

const formatSize = (bytes) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (type) => {
  if (type.startsWith("image/")) return "◈";
  if (type.startsWith("video/")) return "▶";
  if (type.startsWith("audio/")) return "♪";
  if (type === "application/pdf") return "⬡";
  if (type.includes("spreadsheet") || type.includes("excel")) return "⊞";
  if (type.includes("word") || type.includes("document")) return "☰";
  if (type.includes("zip") || type.includes("rar")) return "◉";
  if (type.includes("text") || type.includes("json") || type.includes("xml")) return "≡";
  return "◇";
};

const getFileColor = (type) => {
  if (type.startsWith("image/")) return "#a78bfa";
  if (type.startsWith("video/")) return "#f472b6";
  if (type.startsWith("audio/")) return "#34d399";
  if (type === "application/pdf") return "#fb923c";
  if (type.includes("text") || type.includes("json")) return "#60a5fa";
  return "#94a3b8";
};

export default function FileVault() {
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(null);
  const [analysis, setAnalysis] = useState({});
  const [selected, setSelected] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});
  const fileInput = useRef();

  const simulateUpload = (id) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 25 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setUploadProgress((p) => ({ ...p, [id]: 100 }));
        setTimeout(() => setUploadProgress((p) => { const n = { ...p }; delete n[id]; return n; }), 600);
      } else {
        setUploadProgress((p) => ({ ...p, [id]: Math.floor(progress) }));
      }
    }, 120);
  };

  const processFiles = (rawFiles) => {
    const newFiles = Array.from(rawFiles).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
      lastModified: new Date(f.lastModified),
      url: URL.createObjectURL(f),
    }));
    newFiles.forEach((f) => simulateUpload(f.id));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  }, []);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const deleteFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setAnalysis((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (selected?.id === id) setSelected(null);
  };

  const downloadFile = (file) => {
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.name;
    a.click();
  };

  const toBase64 = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  const analyzeFile = async (fileObj) => {
    setAnalyzing(fileObj.id);
    try {
      let messages;
      if (fileObj.type.startsWith("image/")) {
        const b64 = await toBase64(fileObj.file);
        messages = [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: fileObj.type, data: b64 } },
              { type: "text", text: "Analyze this image. Describe: content/subject, dominant colors, mood/tone, any text visible, and 2-3 interesting observations. Be concise (4-5 sentences)." },
            ],
          },
        ];
      } else if (fileObj.type === "application/pdf" || fileObj.type.startsWith("text/")) {
        let content = "";
        if (fileObj.type.startsWith("text/")) {
          content = await fileObj.file.text();
          content = content.slice(0, 3000);
        }
        messages = [
          {
            role: "user",
            content: content
              ? `Analyze this text file named "${fileObj.name}":\n\n${content}\n\nGive a concise summary (3-4 sentences): main topic, key points, and file purpose.`
              : `I have a PDF file named "${fileObj.name}" (${formatSize(fileObj.size)}). Based on the filename and metadata, what might this document contain? Give a brief analysis.`,
          },
        ];
      } else {
        messages = [
          {
            role: "user",
            content: `Analyze this file: name="${fileObj.name}", type="${fileObj.type}", size=${formatSize(fileObj.size)}, last modified=${fileObj.lastModified.toLocaleDateString()}. What is this file likely used for? Any recommendations for handling it? Be concise (3-4 sentences).`,
          },
        ];
      }

      const resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages }),
      });
      const data = await resp.json();
      const text = data.content?.map((c) => c.text || "").join("") || "Analysis unavailable.";
      setAnalysis((prev) => ({ ...prev, [fileObj.id]: text }));
    } catch (err) {
      setAnalysis((prev) => ({ ...prev, [fileObj.id]: "Failed to analyze file. Please try again." }));
    } finally {
      setAnalyzing(null);
    }
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      color: "#e2e8f0",
      fontFamily: "'Courier New', monospace",
      padding: "0",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }} />

      {/* Header */}
      <header style={{
        position: "relative", zIndex: 10,
        borderBottom: "1px solid rgba(99,102,241,0.2)",
        padding: "20px 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(10,10,15,0.8)",
        backdropFilter: "blur(10px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: 36, height: 36,
            background: "linear-gradient(135deg, #6366f1, #a78bfa)",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: "bold",
          }}>⬡</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: "bold", letterSpacing: "0.1em", color: "#fff" }}>
              FILE<span style={{ color: "#6366f1" }}>VAULT</span>
            </div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.2em" }}>FILE HANDLING API</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "32px", fontSize: 12, color: "#64748b" }}>
          <div><span style={{ color: "#a78bfa", fontSize: 18, fontWeight: "bold" }}>{files.length}</span><br />FILES</div>
          <div><span style={{ color: "#60a5fa", fontSize: 18, fontWeight: "bold" }}>{Object.keys(analysis).length}</span><br />ANALYZED</div>
          <div><span style={{ color: "#34d399", fontSize: 18, fontWeight: "bold" }}>{formatSize(totalSize)}</span><br />TOTAL</div>
        </div>
      </header>

      <div style={{ position: "relative", zIndex: 10, display: "flex", gap: 0, height: "calc(100vh - 77px)" }}>

        {/* Left Panel */}
        <div style={{ width: 420, borderRight: "1px solid rgba(99,102,241,0.15)", display: "flex", flexDirection: "column" }}>
          {/* Drop Zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInput.current.click()}
            style={{
              margin: 20,
              border: `1.5px dashed ${dragging ? "#6366f1" : "rgba(99,102,241,0.3)"}`,
              borderRadius: 12,
              padding: "28px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.02)",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8, opacity: dragging ? 1 : 0.5 }}>⬆</div>
            <div style={{ fontSize: 13, color: dragging ? "#a78bfa" : "#64748b", marginBottom: 4 }}>
              {dragging ? "DROP FILES HERE" : "DRAG & DROP OR CLICK"}
            </div>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.1em" }}>
              IMAGES · DOCUMENTS · ANY FILE TYPE
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => e.target.files.length && processFiles(e.target.files)}
            />
          </div>

          {/* File List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
            {files.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#334155", fontSize: 12, letterSpacing: "0.1em" }}>
                NO FILES UPLOADED<br /><br />
                <span style={{ fontSize: 32, opacity: 0.2 }}>◇</span>
              </div>
            ) : (
              files.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setSelected(f)}
                  style={{
                    padding: "12px 14px",
                    marginBottom: 6,
                    borderRadius: 10,
                    border: `1px solid ${selected?.id === f.id ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.04)"}`,
                    background: selected?.id === f.id ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {uploadProgress[f.id] !== undefined && (
                    <div style={{
                      position: "absolute", bottom: 0, left: 0,
                      height: 2,
                      width: `${uploadProgress[f.id]}%`,
                      background: "linear-gradient(90deg, #6366f1, #a78bfa)",
                      transition: "width 0.1s",
                    }} />
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: `${getFileColor(f.type)}18`,
                      border: `1px solid ${getFileColor(f.type)}40`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, color: getFileColor(f.type),
                    }}>
                      {f.type.startsWith("image/") ? (
                        <img src={f.url} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 6 }} />
                      ) : (
                        getFileIcon(f.type)
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: "bold", color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {f.name}
                      </div>
                      <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                        {formatSize(f.size)} · {f.lastModified.toLocaleDateString()}
                        {analysis[f.id] && <span style={{ color: "#34d399", marginLeft: 6 }}>● ANALYZED</span>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }}
                      style={{
                        background: "none", border: "none", color: "#475569", cursor: "pointer",
                        fontSize: 14, padding: "4px 6px", borderRadius: 6,
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => e.target.style.color = "#f87171"}
                      onMouseLeave={(e) => e.target.style.color = "#475569"}
                    >✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selected ? (
            <>
              {/* File Detail Header */}
              <div style={{
                padding: "20px 28px",
                borderBottom: "1px solid rgba(99,102,241,0.15)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(99,102,241,0.03)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: `${getFileColor(selected.type)}20`,
                    border: `1px solid ${getFileColor(selected.type)}50`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, color: getFileColor(selected.type),
                  }}>
                    {selected.type.startsWith("image/") ? (
                      <img src={selected.url} alt="" style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 8 }} />
                    ) : (
                      getFileIcon(selected.type)
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: "bold", color: "#fff" }}>{selected.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      {selected.type} · {formatSize(selected.size)}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => analyzeFile(selected)}
                    disabled={analyzing === selected.id}
                    style={{
                      padding: "8px 18px",
                      background: analyzing === selected.id ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.15)",
                      border: "1px solid rgba(99,102,241,0.4)",
                      borderRadius: 8,
                      color: analyzing === selected.id ? "#64748b" : "#a78bfa",
                      cursor: analyzing === selected.id ? "not-allowed" : "pointer",
                      fontSize: 11,
                      fontFamily: "inherit",
                      letterSpacing: "0.1em",
                      fontWeight: "bold",
                      transition: "all 0.15s",
                    }}
                  >
                    {analyzing === selected.id ? "ANALYZING..." : "⬡ ANALYZE"}
                  </button>
                  <button
                    onClick={() => downloadFile(selected)}
                    style={{
                      padding: "8px 18px",
                      background: "rgba(52,211,153,0.1)",
                      border: "1px solid rgba(52,211,153,0.3)",
                      borderRadius: 8,
                      color: "#34d399",
                      cursor: "pointer",
                      fontSize: 11,
                      fontFamily: "inherit",
                      letterSpacing: "0.1em",
                      fontWeight: "bold",
                    }}
                  >↓ DOWNLOAD</button>
                </div>
              </div>

              {/* File Content */}
              <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
                {/* Metadata Grid */}
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24,
                }}>
                  {[
                    { label: "SIZE", value: formatSize(selected.size) },
                    { label: "TYPE", value: selected.type.split("/")[1]?.toUpperCase() || "UNKNOWN" },
                    { label: "MODIFIED", value: selected.lastModified.toLocaleDateString() },
                  ].map((item) => (
                    <div key={item.label} style={{
                      padding: "14px 16px",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 10,
                    }}>
                      <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.15em", marginBottom: 6 }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: "bold", color: "#e2e8f0" }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Preview */}
                {selected.type.startsWith("image/") && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.15em", marginBottom: 10 }}>PREVIEW</div>
                    <div style={{
                      borderRadius: 12, overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.08)",
                      maxHeight: 280, display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(0,0,0,0.3)",
                    }}>
                      <img src={selected.url} alt={selected.name} style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain" }} />
                    </div>
                  </div>
                )}

                {/* Audio/Video Preview */}
                {selected.type.startsWith("audio/") && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.15em", marginBottom: 10 }}>AUDIO PLAYER</div>
                    <audio controls src={selected.url} style={{ width: "100%", filter: "invert(1) hue-rotate(180deg)" }} />
                  </div>
                )}

                {selected.type.startsWith("video/") && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.15em", marginBottom: 10 }}>VIDEO PREVIEW</div>
                    <video controls src={selected.url} style={{ width: "100%", borderRadius: 10, maxHeight: 240 }} />
                  </div>
                )}

                {/* AI Analysis */}
                <div>
                  <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.15em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    ⬡ AI ANALYSIS
                    {analyzing === selected.id && (
                      <span style={{ color: "#6366f1", animation: "pulse 1s infinite" }}>● PROCESSING</span>
                    )}
                  </div>
                  <div style={{
                    padding: 18,
                    background: "rgba(99,102,241,0.04)",
                    border: "1px solid rgba(99,102,241,0.15)",
                    borderRadius: 12,
                    minHeight: 100,
                  }}>
                    {analyzing === selected.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {[80, 65, 45].map((w, i) => (
                          <div key={i} style={{
                            height: 10, borderRadius: 4,
                            background: "rgba(99,102,241,0.2)",
                            width: `${w}%`,
                            animation: "shimmer 1.5s infinite",
                          }} />
                        ))}
                      </div>
                    ) : analysis[selected.id] ? (
                      <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>{analysis[selected.id]}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: "20px 0" }}>
                        Click <span style={{ color: "#6366f1" }}>ANALYZE</span> to get AI-powered insights about this file
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#1e293b" }}>
              <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.4 }}>⬡</div>
              <div style={{ fontSize: 13, letterSpacing: "0.2em" }}>SELECT A FILE TO INSPECT</div>
              {files.length === 0 && (
                <div style={{ fontSize: 11, marginTop: 8, color: "#1e293b" }}>UPLOAD FILES TO GET STARTED</div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 4px; }
      `}</style>
    </div>
  );
}
