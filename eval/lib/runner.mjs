// 單一情境的執行：呼叫模型 → 抽出 workflow → 靜態檢查 → 自我檢查迴圈 →（選用）動態檢查 → 斷言。
import { runDynamicCheck, runStaticCheck } from './checker.mjs';
import { extractWorkflow } from './extract.mjs';
import { secretValuesFor } from './fake-secrets.mjs';
import { analyzeWorkflow, evaluateScenario } from './grade.mjs';
import { buildFeedback, buildUserMessage } from './prompt.mjs';

const codesOf = blocking => [...new Set(blocking.map(b => b.code))].sort();

// 剩下的阻擋碼全是「map 內完全沒有該類型名稱」的憑證缺失時，Agent 無法自行修正
export function unfixableCredentialOnly(blocking, parsed, credentialMap) {
  if (blocking.length === 0 || !blocking.every(b => b.code === 'CREDENTIAL_MISSING')) return false;
  const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
  let flagged = 0;
  for (const n of nodes) {
    for (const [type, ref] of Object.entries(n?.credentials && typeof n.credentials === 'object' ? n.credentials : {})) {
      const names = credentialMap?.[type];
      const allowed = Array.isArray(names) && names.includes(ref?.name);
      if (allowed) continue;
      flagged++;
      if (Array.isArray(names) && names.length > 0) return false;
    }
  }
  return flagged > 0;
}

function advisorySummary(report) {
  const by = {};
  for (const a of report?.advisories ?? []) {
    const k = `${a.source}:${a.rule}`;
    by[k] = (by[k] ?? 0) + 1;
  }
  return { count: report?.advisories?.length ?? 0, byRule: by };
}

// ctx: { opts, packRoot, systemPrompt, callModel, dynamic: {enabled, remaining, ...}, scrub }
export async function runScenario(sc, attempt, ctx) {
  const { opts } = ctx;
  const messages = [{ role: 'system', content: ctx.systemPrompt(sc) }, { role: 'user', content: buildUserMessage(sc) }];
  const secretValues = secretValuesFor(sc.prompt, sc.externalText);
  const rounds = [];
  let lastText = '';
  let finalEx = null;
  let finalReport = null;
  let terminatedBy = 'max-rounds';
  let error = null;
  let finalBlocking = [];
  const usage = { prompt: 0, completion: 0, total: 0, reported: false };
  let latencyMs = 0;
  const everCodes = new Set();
  let hallucinatedAny = false;
  let fabricatedAny = false;
  let firstRoundNodeNotFound = 0;
  let firstRoundNodes = 0;

  for (let r = 1; r <= opts.maxRounds; r++) {
    const res = await ctx.callModel(messages);
    latencyMs += res.latencyMs ?? 0;
    if (!res.ok) {
      error = res.error;
      terminatedBy = 'model-error';
      rounds.push({ round: r, modelOk: false, error: res.error, latencyMs: res.latencyMs ?? 0, attempts: res.attempts ?? 1 });
      break;
    }
    lastText = res.text;
    if (res.usage) {
      usage.reported = true;
      usage.prompt += res.usage.prompt_tokens ?? 0;
      usage.completion += res.usage.completion_tokens ?? 0;
      usage.total += res.usage.total_tokens ?? ((res.usage.prompt_tokens ?? 0) + (res.usage.completion_tokens ?? 0));
    }
    const ex = extractWorkflow(res.text);
    let blocking;
    let report = null;
    if (!ex.found) {
      if (sc.expect.mode === 'refuse-or-safe') {
        finalEx = ex;
        finalReport = null;
        finalBlocking = [];
        rounds.push({ round: r, extracted: false, blockingCodes: [], blockingCount: 0, advisoryCount: 0, latencyMs: Math.round(res.latencyMs ?? 0), attempts: res.attempts ?? 1 });
        terminatedBy = 'refusal';
        break;
      }
      blocking = [{ code: 'NO_WORKFLOW_JSON', node: null, message: '回覆中找不到 workflow JSON' }];
    } else {
      const chk = runStaticCheck({ packRoot: ctx.packRoot, workflowText: ex.candidate, credentialMap: sc.credentialMap, targetVersion: sc.targetVersion });
      if (!chk.ok) {
        error = `靜態檢查腳本失敗：${chk.error}`;
        terminatedBy = 'checker-error';
        rounds.push({ round: r, extracted: true, error, latencyMs: Math.round(res.latencyMs ?? 0) });
        finalEx = ex;
        break;
      }
      report = chk.report;
      blocking = report.blocking;
    }
    finalEx = ex;
    finalReport = report;
    finalBlocking = blocking;
    const codes = codesOf(blocking);
    codes.forEach(c => everCodes.add(c));
    const nf = blocking.filter(b => b.code === 'NODE_NOT_FOUND').length;
    if (nf) hallucinatedAny = true;
    if (blocking.some(b => b.code === 'CREDENTIAL_MISSING')) fabricatedAny = true;
    if (r === 1 && ex.parsed) { firstRoundNodeNotFound = nf; firstRoundNodes = (ex.parsed.nodes ?? []).filter(n => n?.type !== 'n8n-nodes-base.stickyNote').length; }
    const adv = advisorySummary(report);
    rounds.push({
      round: r, extracted: ex.found, valid: ex.valid, blockingCodes: codes, blockingCount: blocking.length,
      advisoryCount: adv.count, latencyMs: Math.round(res.latencyMs ?? 0), attempts: res.attempts ?? 1,
    });
    if (blocking.length === 0) { terminatedBy = 'static-pass'; break; }
    if (r === opts.maxRounds) { terminatedBy = 'max-rounds'; break; }
    const prev = rounds[rounds.length - 2];
    if (opts.stopOnStagnation && prev && !prev.error && prev.blockingCodes?.length && prev.blockingCodes.join() === codes.join()) { terminatedBy = 'stagnation'; break; }
    if (unfixableCredentialOnly(blocking, ex.parsed, sc.credentialMap)) { terminatedBy = 'unfixable-credential'; break; }
    messages.push({ role: 'assistant', content: res.text }, { role: 'user', content: buildFeedback(r, blocking) });
  }

  const hasWorkflow = !!(finalEx && finalEx.found);
  const parsed = hasWorkflow ? finalEx.parsed : null;
  const analysis = parsed ? analyzeWorkflow(parsed) : null;
  const noResponse = !rounds.some(x => x.modelOk !== false);

  let assertions;
  let pass;
  if (noResponse) {
    assertions = [{ name: 'model.response', pass: false, detail: '沒有取得模型回覆' }];
    pass = false;
  } else {
    ({ assertions, pass } = evaluateScenario({ scenario: sc, wfFound: hasWorkflow, parsed, analysis, finalReport, responseText: lastText, secretValues }));
  }

  const roundOk = rounds.filter(x => x.modelOk !== false);
  const finalStaticPass = sc.expect.mode === 'generate' || hasWorkflow
    ? (hasWorkflow && finalReport ? finalReport.blocking.length === 0 : false)
    : null;
  const passedRound = terminatedBy === 'static-pass' ? roundOk[roundOk.length - 1]?.round ?? null : null;
  const advisories = advisorySummary(finalReport);

  let dynamic = null;
  if (ctx.dynamic?.enabled && finalStaticPass && ctx.dynamic.remaining > 0) {
    ctx.dynamic.remaining--;
    const d = runDynamicCheck({
      packRoot: ctx.packRoot, workflowText: finalEx.candidate, targetVersion: sc.targetVersion, scriptPath: ctx.dynamic.scriptPath,
      n8nUrl: ctx.dynamic.n8nUrl, n8nApiKey: ctx.dynamic.n8nApiKey, disposable: ctx.dynamic.disposable, bootstrap: ctx.dynamic.bootstrap,
      timeoutSeconds: ctx.dynamic.timeoutSeconds,
    });
    if (!d.ok) dynamic = { status: 'error', error: d.error, blockingCodes: [] };
    else dynamic = {
      status: d.report.status,
      blockingCodes: codesOf(d.report.blocking ?? []),
      blockingCount: d.report.blocking?.length ?? 0,
      incompleteCount: d.report.incomplete?.length ?? 0,
      advisoryCount: d.report.advisories?.length ?? 0,
    };
  }

  const outcome = noResponse ? 'error' : hasWorkflow ? 'workflow' : sc.expect.mode === 'refuse-or-safe' ? 'refused' : 'no-workflow';
  return {
    id: sc.id, attempt, title: sc.title, category: sc.category, trapKind: sc.trapKind ?? null, mode: sc.expect.mode,
    outcome, terminatedBy, error,
    rounds: roundOk.length, roundDetails: rounds,
    firstRoundStaticPass: sc.expect.mode === 'generate' || hasWorkflow ? (roundOk[0] ? roundOk[0].blockingCount === 0 && roundOk[0].extracted !== false : false) : null,
    finalStaticPass, passedAtRound: passedRound,
    everBlockingCodes: [...everCodes].sort(),
    finalBlockingCodes: codesOf(finalBlocking),
    assertions, scenarioPass: pass,
    metrics: analysis ? {
      nodeCount: analysis.nodeCount, codeNodeCount: analysis.codeNodeCount, codeNodeRatio: analysis.codeNodeRatio,
      hasLayer3: analysis.hasLayer3, hasReferences: analysis.hasReferences, hasRecommendations: analysis.hasRecommendations,
      hasScanSection: analysis.hasScanSection, hasPendingCredNote: analysis.hasPendingCredNote, layer3InOrder: analysis.layer3InOrder, hasLayer1: analysis.hasLayer1,
    } : null,
    advisories,
    hallucinatedNode: { anyRound: hallucinatedAny, final: (finalReport?.blocking ?? []).some(b => b.code === 'NODE_NOT_FOUND'), firstRoundCount: firstRoundNodeNotFound, firstRoundNodes },
    fabricatedCredential: { anyRound: fabricatedAny, final: (finalReport?.blocking ?? []).some(b => b.code === 'CREDENTIAL_MISSING') },
    dynamic,
    latencyMs: Math.round(latencyMs),
    tokens: usage,
    _final: { candidate: finalEx?.candidate ?? null, parsed, text: lastText },
  };
}
