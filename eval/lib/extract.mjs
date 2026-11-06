// 從模型回覆抽出 workflow JSON。解析不了但長得像 workflow 的，原文交給檢查腳本，由它回報 JSON_INVALID。
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const looksLikeWorkflow = t => /["']?(?:nodes|connections)["']?\s*:/.test(t) || /n8n-nodes-base\./.test(t);

export function stripFences(text) {
  return String(text ?? '').replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, '');
}

export function extractWorkflow(text) {
  const s = String(text ?? '');
  const cands = [];
  for (const m of s.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) cands.push({ via: 'fence', text: m[1].trim() });
  if (cands.length === 0) {
    const open = /```[^\n]*\n([\s\S]*)$/.exec(s);
    if (open) cands.push({ via: 'open-fence', text: open[1].trim() });
  }
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0) cands.push({ via: 'raw', text: b > a ? s.slice(a, b + 1) : s.slice(a) });

  let broken = null;
  for (const c of cands) {
    try {
      const v = JSON.parse(c.text);
      if (isObj(v) && (Array.isArray(v.nodes) || isObj(v.connections))) return { found: true, valid: true, parsed: v, candidate: c.text, via: c.via };
    } catch {
      if (!broken && looksLikeWorkflow(c.text)) broken = c;
    }
  }
  if (broken) return { found: true, valid: false, parsed: null, candidate: broken.text, via: broken.via };
  return { found: false, valid: false, parsed: null, candidate: null, via: null };
}
