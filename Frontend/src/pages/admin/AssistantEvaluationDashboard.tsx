import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../../api";

type Result = { id: string; title: string; passed: boolean; reply: string; mockState: { bookingCreated: boolean; cancellationCreated: boolean; rescheduleCreated: boolean; toolCalled: boolean }; failures: Array<{ failureType: string; evidence: string; expectedBehavior: string; improvement: string }> };
type Report = { generatedAt: string; before: { score: number; total: number; results: Result[] }; after: { score: number; total: number; results: Result[] }; improvement: { guardrail: string; failures: Array<{ failureType: string; evidence: string; expectedBehavior: string; improvement: string }> }; limitation: string };
type Conversation = { _id: string; threadId: string; channel: "text" | "voice"; userMessage: string; assistantReply: string; createdAt: string };
type LiveFinding = { threadId: string; severity: "warning" | "review"; type: string; evidence: string; recommendation: string; createdAt: string };
type ActionAudit = { _id: string; threadId: string; action: "book" | "reschedule" | "cancel"; outcome: "succeeded" | "failed"; appointmentId?: string | null; errorCode?: number | null; errorMessage?: string; createdAt: string };
type LiveAnalysis = { analysedConversations: number; actionAudits: ActionAudit[]; findings: LiveFinding[]; limitation: string };

export function AssistantEvaluationDashboard() {
  const [report, setReport] = useState<Report | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [liveAnalysis, setLiveAnalysis] = useState<LiveAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextReport, logs, analysis] = await Promise.all([
        api<Report>("/api/admin/assistant-evaluations"),
        api<{ conversations: Conversation[] }>("/api/admin/assistant-conversations?limit=30"),
        api<LiveAnalysis>("/api/admin/assistant-conversations/analysis"),
      ]);
      setReport(nextReport); setConversations(logs.conversations); setLiveAnalysis(analysis);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load assistant evaluation data."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setRunning(true); setError("");
    try { setReport(await api<Report>("/api/admin/assistant-evaluations/run", { method: "POST" })); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Evaluation could not run."); }
    finally { setRunning(false); }
  };

  if (loading) return <div className="panel"><p>Loading assistant quality checks…</p></div>;
  return <section className="admin-evaluation-page">
    <div className="page-title-row"><div><span className="eyebrow">ADMIN ONLY</span><h1>AI quality control</h1><p>Mock-state checks prevent unsafe bookings without touching live appointments or calendars.</p></div><div className="page-actions"><button className="button button-outline" onClick={() => void load()}><RefreshCw size={15}/>Refresh</button><button className="button button-primary" onClick={() => void run()} disabled={running}><Play size={15}/>{running ? "Running checks…" : "Run evaluation"}</button></div></div>
    {error && <div className="error-banner"><AlertTriangle size={16}/>{error}</div>}
    {report && <>
      <div className="admin-score-grid"><article className="panel"><small>BEFORE GUARDRAILS</small><b>{report.before.score}/{report.before.total}</b><span>Baseline policy score</span></article><article className="panel success"><small>AFTER GUARDRAILS</small><b>{report.after.score}/{report.after.total}</b><span>Regression suite score</span></article><article className="panel"><small>REGRESSION STATUS</small><b>{report.after.results.filter((item) => item.passed).length === report.after.total ? "PASS" : "REVIEW"}</b><span>All existing safety cases rerun</span></article></div>
      <article className="panel admin-guardrail"><div><ShieldCheck size={18}/><b>Applied guardrail</b></div><p>{report.improvement.guardrail}</p></article>
      <section className="panel"><div className="admin-section-heading"><div><ShieldCheck size={18}/><h2>Live conversation analysis</h2></div><span>{liveAnalysis?.analysedConversations ?? 0} conversations analysed</span></div><p className="muted">Automatically checks real recorded text and voice chats for confirmation loops, booking claims before a visible confirmation, privacy-risk wording, and slow replies.</p>{liveAnalysis?.findings.length ? <div className="admin-live-findings">{liveAnalysis.findings.map((finding, index) => <article className={finding.severity === "warning" ? "admin-result fail" : "admin-result"} key={`${finding.threadId}-${finding.type}-${index}`}><div>{finding.severity === "warning" ? <AlertTriangle size={16}/> : <ShieldCheck size={16}/>}<b>{finding.type.replace(/_/g, " ")}</b></div><span>{finding.evidence}</span><small>Recommendation: {finding.recommendation}</small></article>)}</div> : <p className="admin-analysis-clear"><CheckCircle2 size={16}/>No review signals found in the recorded conversations.</p>}<p className="muted">{liveAnalysis?.limitation}</p></section>
      <section className="panel"><h2>Actual appointment tool outcomes</h2><p className="muted">This is recorded from the booking/reschedule/cancellation tool and database layer—not inferred from chat text.</p>{liveAnalysis?.actionAudits.length ? <div className="admin-live-findings">{liveAnalysis.actionAudits.slice(0, 30).map((action) => <article className={action.outcome === "succeeded" ? "admin-result pass" : "admin-result fail"} key={action._id}><div>{action.outcome === "succeeded" ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}<b>{action.action} {action.outcome}</b></div><span>Thread: {action.threadId}{action.appointmentId ? ` · Appointment: ${action.appointmentId}` : ""}</span><small>{action.outcome === "failed" ? `Error ${action.errorCode ?? ""}: ${action.errorMessage ?? "Unknown error"}` : "Database-backed action completed."}</small></article>)}</div> : <p className="muted">No assistant-triggered appointment actions have been recorded yet.</p>}</section>
      <section className="panel"><h2>Hard-case results</h2><p className="muted">Each result checks the reply and actual mock tool state. A transcript alone cannot prove that a booking was created.</p><div className="admin-results">{report.after.results.map((result) => <article key={result.id} className={result.passed ? "admin-result pass" : "admin-result fail"}><div>{result.passed ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}<b>{result.title}</b></div><span>{result.reply}</span><small>Mock state: booking={String(result.mockState.bookingCreated)}, tool called={String(result.mockState.toolCalled)}</small></article>)}</div></section>
      {report.improvement.failures.length > 0 && <section className="panel admin-resolved-issues"><div className="admin-section-heading"><div><CheckCircle2 size={18}/><h2>Resolved baseline issues</h2></div><span>Current evaluation: {report.after.score}/{report.after.total} passed</span></div><p className="muted">These are historical failures intentionally reproduced by the baseline. The active guarded agent passes the same cases below.</p>{report.improvement.failures.map((failure, index) => <div className="admin-failure" key={`${failure.failureType}-${index}`}><b>Resolved · {failure.failureType}</b><span>{failure.evidence}</span><small>Applied fix: {failure.improvement}</small></div>)}</section>}
      <section className="panel"><h2>Recent assistant conversations</h2><p className="muted">Restricted to admin accounts. Review these for recurring failures before changing prompt or guardrails.</p>{conversations.length ? <div className="admin-conversations">{conversations.map((item) => <article key={item._id}><small>{item.channel} · {new Date(item.createdAt).toLocaleString()}</small><b>Patient: {item.userMessage}</b><span>Assistant: {item.assistantReply}</span></article>)}</div> : <p className="muted">No assistant conversations have been recorded yet.</p>}</section>
      <p className="muted">{report.limitation}</p>
    </>}
  </section>;
}
