import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../../api";

type Failure = { failureType: string; evidence: string; expectedBehavior: string; improvement: string };
type Result = { id: string; title: string; passed: boolean; reply: string; mockState: { bookingCreated: boolean; cancellationCreated: boolean; rescheduleCreated: boolean; toolCalled: boolean }; failures: Failure[] };
type Report = { generatedAt: string; before: { score: number; total: number; results: Result[] }; after: { score: number; total: number; results: Result[] }; improvement: { guardrail: string; failures: Failure[] }; limitation: string };
type Conversation = { _id: string; threadId: string; channel: "text" | "voice"; userMessage: string; assistantReply: string; createdAt: string; latencyMs?: number };
type LiveFinding = { threadId: string; severity: "warning" | "review"; type: string; evidence: string; recommendation: string; createdAt: string };
type ActionAudit = { _id: string; threadId: string; action: "book" | "reschedule" | "cancel"; outcome: "succeeded" | "failed"; appointmentId?: string | null; errorCode?: number | null; errorMessage?: string; createdAt: string };
type LiveAnalysis = { analysedConversations: number; actionAudits: ActionAudit[]; findings: LiveFinding[]; limitation: string };
type ConversationDetail = { threadId: string; conversations: Conversation[]; actionAudits: ActionAudit[]; findings: LiveFinding[]; explanation: { summary: string; checks: string[]; outcome: string; averageLatencyMs: number; changesApplied?: string[]; boundary: string } };
type EvaluationStep = "baseline" | "findings" | "guardrail" | "rerun";

const mockState = (result: Result) => `Mock tool state: booking=${String(result.mockState.bookingCreated)}, tool called=${String(result.mockState.toolCalled)}`;

const cachedConversationDetail = (selected: Conversation, allConversations: Conversation[], analysis: LiveAnalysis | null): ConversationDetail => {
  const conversations = allConversations.filter((item) => item.threadId === selected.threadId);
  const threadConversations = conversations.length ? conversations : [selected];
  const actionAudits = analysis?.actionAudits.filter((item) => item.threadId === selected.threadId) ?? [];
  const findings = analysis?.findings.filter((item) => item.threadId === selected.threadId) ?? [];
  const averageLatencyMs = Math.round(threadConversations.reduce((total, item) => total + (item.latencyMs ?? 0), 0) / threadConversations.length);
  return {
    threadId: selected.threadId,
    conversations: threadConversations,
    actionAudits,
    findings,
    explanation: {
      summary: findings.length ? `${findings.length} issue${findings.length === 1 ? "" : "s"} detected in the currently loaded analysis.` : "No issue was detected in the currently loaded analysis. The detailed server analysis is loading next.",
      checks: ["Confirmation and booking-success claims", "Actual appointment action audit", "Privacy-risk wording", "Slow response and recovery reply"],
      outcome: actionAudits.some((item) => item.outcome === "succeeded") ? "A completed appointment-tool action is present in the currently loaded audit." : "No completed appointment-tool action is present in the currently loaded audit.",
      averageLatencyMs,
      boundary: "Cached client analysis is shown immediately. The complete server transcript and detailed evidence replace it when available.",
    },
  };
};

export function AssistantEvaluationDashboard() {
  const [report, setReport] = useState<Report | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [liveAnalysis, setLiveAnalysis] = useState<LiveAnalysis | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ConversationDetail | null>(null);
  const [selectedThread, setSelectedThread] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailNotice, setDetailNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [selectedEvaluationStep, setSelectedEvaluationStep] = useState<EvaluationStep>("baseline");
  const detailRef = useRef<HTMLElement>(null);

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
  useEffect(() => {
    if (selectedDetail) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDetail]);

  const run = async () => {
    setRunning(true); setError("");
    try { setReport(await api<Report>("/api/admin/assistant-evaluations/run", { method: "POST" })); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Evaluation could not run."); }
    finally { setRunning(false); }
  };

  const openConversation = async (item: Conversation) => {
    if (selectedThread === item.threadId && selectedDetail) return;
    setSelectedThread(item.threadId); setDetailNotice(""); setSelectedDetail(cachedConversationDetail(item, conversations, liveAnalysis)); setLoadingDetail(true); setError("");
    try { setSelectedDetail(await api<ConversationDetail>(`/api/admin/assistant-conversations/${encodeURIComponent(item.threadId)}`)); }
    catch { setDetailNotice("The detailed server endpoint is unavailable in this deployment, so the cached transcript and current analysis are shown below. Deploy the backend update to enable the complete thread lookup."); }
    finally { setLoadingDetail(false); }
  };

  if (loading) return <div className="panel"><p>Loading assistant quality checks...</p></div>;
  const baselineFailures = report?.before.results.filter((item) => !item.passed) ?? [];
  const selectedStepCopy: Record<EvaluationStep, { title: string; description: string }> = {
    baseline: { title: "1. Baseline run — what failed before the fix", description: "This isolated run deliberately uses the previous unguarded behaviour. It never touches a real appointment or calendar." },
    findings: { title: "2. Evaluator findings — why the cases failed", description: "The evaluator compares the reply with the mock action state, so a success sentence alone cannot pass the test." },
    guardrail: { title: "3. Improvement applied — what changed in the assistant", description: "This is the active safety policy used by the guarded test. It is not an automatic production self-edit; it is a versioned rule enforced by the workflow." },
    rerun: { title: "4. Regression re-run — proof the same cases improved", description: "The exact same scenarios are run after the guardrail. Passing cases are rerun too, to catch regressions." },
  };
  return <section className="admin-evaluation-page">
    <div className="page-title-row"><div><span className="eyebrow">ADMIN ONLY</span><h1>AI quality control</h1><p>Run a safe baseline, inspect failures, apply the active guardrail, and rerun the same cases without changing live appointments.</p></div><div className="page-actions"><button className="button button-outline" onClick={() => void load()}><RefreshCw size={15}/>Refresh</button><button className="button button-primary" onClick={() => void run()} disabled={running}><Play size={15}/>{running ? "Running checks..." : "Run evaluation"}</button></div></div>
    {error && <div className="error-banner"><AlertTriangle size={16}/>{error}</div>}
    {report && <>
      <div className="admin-score-grid"><article className="panel"><small>BASELINE RUN</small><b>{report.before.score}/{report.before.total}</b><span>Old unguarded policy simulation</span></article><article className="panel success"><small>REGRESSION RE-RUN</small><b>{report.after.score}/{report.after.total}</b><span>Active guarded policy simulation</span></article><article className="panel"><small>REGRESSION STATUS</small><b>{report.after.results.every((item) => item.passed) ? "PASS" : "REVIEW"}</b><span>Existing cases rerun after the fix</span></article></div>
      <section className="panel"><div className="admin-section-heading"><div><ShieldCheck size={18}/><h2>Improvement proof: run to re-run</h2></div><span>Generated {new Date(report.generatedAt).toLocaleString()}</span></div><p className="muted">Click any step to inspect its evidence, change, and result. This isolated deterministic test does not modify a real calendar.</p><div className="admin-evaluation-flow"><button type="button" className={selectedEvaluationStep === "baseline" ? "selected" : ""} onClick={() => setSelectedEvaluationStep("baseline")}><small>1. RUN BASELINE</small><b>{report.before.score}/{report.before.total}</b><span>{baselineFailures.length} failure{baselineFailures.length === 1 ? "" : "s"} reproduced.</span><em>View evidence</em></button><ChevronRight aria-hidden="true" /><button type="button" className={selectedEvaluationStep === "findings" ? "selected" : ""} onClick={() => setSelectedEvaluationStep("findings")}><small>2. EVALUATOR FLAGS</small><b>{report.improvement.failures.length}</b><span>Structured evidence and expected behavior captured.</span><em>View findings</em></button><ChevronRight aria-hidden="true" /><button type="button" className={selectedEvaluationStep === "guardrail" ? "selected" : ""} onClick={() => setSelectedEvaluationStep("guardrail")}><small>3. IMPROVEMENT APPLIED</small><b>Guardrail</b><span>Safety rule added to the guarded workflow.</span><em>View change</em></button><ChevronRight aria-hidden="true" /><button type="button" className={selectedEvaluationStep === "rerun" ? "success selected" : "success"} onClick={() => setSelectedEvaluationStep("rerun")}><small>4. SAME TESTS RE-RUN</small><b>{report.after.score}/{report.after.total}</b><span>Score change: +{report.after.score - report.before.score}.</span><em>View proof</em></button></div><section className="admin-evaluation-step-detail" aria-live="polite"><h3>{selectedStepCopy[selectedEvaluationStep].title}</h3><p>{selectedStepCopy[selectedEvaluationStep].description}</p>{selectedEvaluationStep === "baseline" && <div className="admin-step-items">{baselineFailures.map((item) => <article key={item.id}><b>{item.title}</b><span>Old reply: {item.reply}</span><small>{mockState(item)}</small></article>)}</div>}{selectedEvaluationStep === "findings" && <div className="admin-step-items">{report.improvement.failures.map((failure, index) => <article key={`${failure.failureType}-${index}`}><b>{failure.failureType.replace(/_/g, " ")}</b><span>Evidence: {failure.evidence}</span><small>Expected: {failure.expectedBehavior}</small></article>)}</div>}{selectedEvaluationStep === "guardrail" && <div className="admin-step-items"><article><b>Active rule</b><span>{report.improvement.guardrail}</span><small>Enforced before a booking, reschedule, or cancellation tool can execute.</small></article></div>}{selectedEvaluationStep === "rerun" && <div className="admin-step-items">{report.after.results.filter((item) => baselineFailures.some((failed) => failed.id === item.id)).map((item) => <article key={item.id}><b>{item.title}: {item.passed ? "passed" : "review"}</b><span>Guarded reply: {item.reply}</span><small>{mockState(item)}</small></article>)}</div>}</section></section>
      {baselineFailures.length > 0 && <section className="panel admin-resolved-issues"><div className="admin-section-heading"><div><CheckCircle2 size={18}/><h2>Failure evidence and regression result</h2></div><span>Before versus after</span></div>{baselineFailures.map((before) => { const after = report.after.results.find((item) => item.id === before.id); const failure = before.failures[0]; return <div className="admin-regression-proof" key={before.id}><article className="admin-result fail"><div><AlertTriangle size={16}/><b>Baseline failed: {before.title}</b></div><span>{before.reply}</span><small>{mockState(before)}</small></article><article className="admin-failure"><b>Evaluator finding: {failure?.failureType ?? "policy failure"}</b><span>Evidence: {failure?.evidence ?? "Baseline expected behavior was not met."}</span><small>Fix applied: {failure?.improvement ?? report.improvement.guardrail}</small></article><article className={after?.passed ? "admin-result pass" : "admin-result fail"}><div>{after?.passed ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}<b>Re-run: {after?.passed ? "passed" : "review required"}</b></div><span>{after?.reply ?? "No regression result available."}</span>{after && <small>{mockState(after)}</small>}</article></div>; })}</section>}
      <section className="panel"><div className="admin-section-heading"><div><ShieldCheck size={18}/><h2>Live conversation analysis</h2></div><span>{liveAnalysis?.analysedConversations ?? 0} conversations analysed</span></div><p className="muted">Automatically checks real recorded text and voice chats for confirmation loops, booking claims before visible confirmation, privacy-risk wording, and slow replies.</p>{liveAnalysis?.findings.length ? <div className="admin-live-findings">{liveAnalysis.findings.map((finding, index) => <article className={finding.severity === "warning" ? "admin-result fail" : "admin-result"} key={`${finding.threadId}-${finding.type}-${index}`}><div>{finding.severity === "warning" ? <AlertTriangle size={16}/> : <ShieldCheck size={16}/>}<b>{finding.type.replace(/_/g, " ")}</b></div><span>{finding.evidence}</span><small>Recommendation: {finding.recommendation}</small></article>)}</div> : <p className="admin-analysis-clear"><CheckCircle2 size={16}/>No review signals found in the recorded conversations.</p>}<p className="muted">{liveAnalysis?.limitation}</p></section>
      <section className="panel"><h2>Actual appointment tool outcomes</h2><p className="muted">Recorded from the booking/reschedule/cancellation tool and database layer, not inferred from chat text.</p>{liveAnalysis?.actionAudits.length ? <div className="admin-live-findings">{liveAnalysis.actionAudits.slice(0, 30).map((action) => <article className={action.outcome === "succeeded" ? "admin-result pass" : "admin-result fail"} key={action._id}><div>{action.outcome === "succeeded" ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}<b>{action.action} {action.outcome}</b></div><span>Thread: {action.threadId}{action.appointmentId ? ` | Appointment: ${action.appointmentId}` : ""}</span><small>{action.outcome === "failed" ? `Error ${action.errorCode ?? ""}: ${action.errorMessage ?? "Unknown error"}` : "Database-backed action completed."}</small></article>)}</div> : <p className="muted">No assistant-triggered appointment actions have been recorded yet.</p>}</section>
      <section className="panel"><h2>Hard-case results</h2><p className="muted">Each result checks the reply and actual mock tool state. A transcript alone cannot prove that a booking was created.</p><div className="admin-results">{report.after.results.map((result) => <article key={result.id} className={result.passed ? "admin-result pass" : "admin-result fail"}><div>{result.passed ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}<b>{result.title}</b></div><span>{result.reply}</span><small>{mockState(result)}</small></article>)}</div></section>
      <section className="panel"><h2>Previous assistant chats</h2><p className="muted">Click a chat to open the complete thread, detected issue, why it was flagged, recommended fix, and actual appointment-tool outcome.</p>{conversations.length ? <div className="admin-conversations">{conversations.map((item) => <button type="button" className={selectedThread === item.threadId ? "admin-conversation-button selected" : "admin-conversation-button"} key={item._id} onClick={() => void openConversation(item)}><small>{item.channel} | {new Date(item.createdAt).toLocaleString()}</small><b>Patient: {item.userMessage}</b><span>Assistant: {item.assistantReply}</span><em>Open explanation <ChevronRight size={14}/></em></button>)}</div> : <p className="muted">No assistant conversations have been recorded yet.</p>}</section>
      {selectedThread && <section className="panel admin-conversation-detail" ref={detailRef}><div className="admin-section-heading"><div><ShieldCheck size={18}/><h2>Conversation explanation</h2></div><span>Thread: {selectedThread}</span></div>{detailNotice && <p className="admin-detail-notice">{detailNotice}</p>}{loadingDetail && <p className="muted">Loading complete server evidence...</p>}{selectedDetail && <><p className="muted">{selectedDetail.explanation.summary}</p><div className="admin-detail-grid"><article><b>What was checked</b><ul>{selectedDetail.explanation.checks.map((check) => <li key={check}>{check}</li>)}</ul></article><article><b>Actual outcome</b><p>{selectedDetail.explanation.outcome}</p><small>Average response time: {(selectedDetail.explanation.averageLatencyMs / 1000).toFixed(1)} seconds</small></article></div>{selectedDetail.findings.length ? <div className="admin-live-findings">{selectedDetail.findings.map((finding, index) => <article className={finding.severity === "warning" ? "admin-result fail" : "admin-result"} key={`${finding.type}-${index}`}><div><AlertTriangle size={16}/><b>{finding.type.replace(/_/g, " ")}</b></div><span>Why flagged: {finding.evidence}</span><small>Recommended fix: {finding.recommendation}</small></article>)}</div> : <p className="admin-analysis-clear"><CheckCircle2 size={16}/>No automated issue was detected in this thread.</p>}{selectedDetail.explanation.changesApplied?.length ? <><h3>Changes applied for this issue</h3><div className="admin-change-list">{selectedDetail.explanation.changesApplied.map((change) => <p key={change}>{change}</p>)}</div></> : null}<h3>Thread transcript</h3><div className="admin-conversation-transcript">{selectedDetail.conversations.map((turn) => <article key={turn._id}><small>{turn.channel} | {new Date(turn.createdAt).toLocaleString()}{typeof turn.latencyMs === "number" ? ` | ${(turn.latencyMs / 1000).toFixed(1)}s` : ""}</small><b>Patient: {turn.userMessage}</b><span>Assistant: {turn.assistantReply}</span></article>)}</div><p className="muted">{selectedDetail.explanation.boundary}</p></>}</section>}
      <p className="muted">{report.limitation}</p>
    </>}
  </section>;
}
