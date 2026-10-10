import { useState } from "react";
import { BookOpen, FileText } from "lucide-react";
import { api } from "../../api";

type UploadedFile = { name: string; size: number; status: string };

export function KnowledgeBase() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const uploadFiles = async (selected: FileList | null) => {
    if (!selected?.length) return;
    setBusy(true);
    setMessage("");
    const uploaded: UploadedFile[] = [];
    try {
      for (const file of Array.from(selected)) {
        if (file.type !== "application/pdf") {
          setMessage(`${file.name} is not a PDF. Only clinic PDFs are accepted.`);
          continue;
        }
        const data = new FormData();
        data.append("file", file);
        const result = await api<{ message?: string }>("/api/doctor/knowledge", { method: "POST", body: data });
        uploaded.push({ name: file.name, size: file.size, status: result.message || "Uploaded" });
      }
      setFiles((current) => [...uploaded, ...current]);
      if (uploaded.length) setMessage("Your clinic documents were added to the knowledge base.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Document upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="page-wrap"><div className="page-title-row"><div><div className="date-kicker">AI CLINIC KNOWLEDGE</div><h1>Knowledge Base</h1><p>Give your assistant the clinic information it needs to help patients.</p></div></div><label className="upload-zone"><input type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void uploadFiles(event.target.files); event.currentTarget.value = ""; }} /><div className="upload-icon"><FileText size={20} /></div><h3>{busy ? "Uploading your document…" : "Drop your clinic PDFs here"}</h3><p>Pricing, post-op care, clinic FAQs, insurance — or click to browse</p><span className="button button-outline button-small">Browse files</span><small>PDF only · Maximum 10 MB per document</small></label>{message && <div className={message.includes("failed") || message.includes("not a PDF") ? "error-banner" : "notice"}>{message}</div>}<div className="section-heading knowledge-heading"><div><h2>Uploaded documents</h2><p>Documents you add will be available to your clinic assistant.</p></div></div>{files.length ? <div className="knowledge-grid">{files.map((file, index) => <div className="knowledge-card" key={`${file.name}-${index}`}><div className="knowledge-file-icon"><FileText size={18} /></div><div><b>{file.name}</b><span>{(file.size / 1024).toFixed(0)} KB · {file.status}</span></div><span className="file-tag">Clinic PDF</span></div>)}</div> : <div className="empty-state empty-knowledge"><div className="empty-icon"><BookOpen size={22} /></div><h3>Your knowledge base is ready</h3><p>Upload a PDF to help the assistant answer clinic-specific questions.</p></div>}</div>;
}
