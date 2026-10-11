import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { ApiError, api } from "../../api";

type UploadedFile = { name: string; size: number; status: string };
type KnowledgeUploadResult = {
  message?: string;
  stage?: string;
  detail?: string;
};

const indexingStageLabel = (stage?: string) => {
  const labels: Record<string, string> = {
    doctor_profile: "doctor profile",
    pdf_extraction: "PDF text extraction",
    chunking: "document chunking",
    embeddings: "Gemini embeddings",
    file_storage: "Cloudinary storage",
    database: "database storage",
  };
  return stage ? labels[stage] ?? stage : "indexing";
};

export function KnowledgeBase({ onContinue, onboarding = false }: { onContinue?: () => void; onboarding?: boolean }) {
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
        const result = await api<KnowledgeUploadResult>("/api/doctor/knowledge", { method: "POST", body: data });
        uploaded.push({ name: file.name, size: file.size, status: result.message || "Uploaded" });
      }
      setFiles((current) => [...uploaded, ...current]);
      if (uploaded.length) setMessage("Your clinic documents were added to the knowledge base.");
    } catch (reason) {
      if (reason instanceof ApiError && typeof reason.data === "object" && reason.data !== null) {
        const error = reason.data as KnowledgeUploadResult;
        if (error.stage || error.detail) {
          setMessage(`Could not complete ${indexingStageLabel(error.stage)}: ${error.detail ?? error.message ?? "Unknown error"}`);
        } else {
          setMessage(error.message ?? "Document upload failed.");
        }
      } else if (reason instanceof Error) {
        setMessage(reason.message);
      } else {
        setMessage("Document upload failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return <div className={`page-wrap ${onboarding ? "onboarding-knowledge" : ""}`}>{!onboarding && <div className="page-title-row"><div><div className="date-kicker">AI CLINIC KNOWLEDGE</div><h1>Knowledge base</h1><p>Upload clinic documents for the assistant to use when answering patient questions.</p></div></div>}<label className="upload-zone"><input type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={(event) => { void uploadFiles(event.target.files); event.currentTarget.value = ""; }} /><h3>{busy ? "Uploading document…" : "Upload clinic documents"}</h3><p>Choose PDFs about services, fees, clinic policies, and patient instructions.</p><span className="button button-outline button-small">Browse files</span><small>PDF only · Maximum 10 MB per document</small></label>{message && <div className={message.includes("failed") || message.includes("not a PDF") || message.includes("Could not") ? "error-banner" : "notice"}>{message}</div>}<div className="section-heading knowledge-heading"><div><h2>Uploads in this session</h2><p>Uploaded files are indexed for this clinic’s assistant.</p></div></div>{files.length ? <div className="knowledge-grid">{files.map((file, index) => <div className="knowledge-card" key={`${file.name}-${index}`}><div><b>{file.name}</b><span>{(file.size / 1024).toFixed(0)} KB</span></div><span className="file-tag">Indexed</span></div>)}</div> : <div className="empty-state empty-knowledge"><h3>No uploads in this session</h3><p>Upload a PDF to add clinic-specific information to the assistant.</p></div>}{onboarding && <div className="onboarding-step-actions"><button className="button button-primary" type="button" disabled={busy} onClick={onContinue}>Finish setup<ArrowRight size={15} /></button><span>Document upload is optional. You can add files later.</span></div>}</div>;
}
