import { runAssistantEvaluation } from "../evaluations/assistantEvaluation.js";

const report = runAssistantEvaluation();
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.after.score === report.after.total ? 0 : 1;
