// 靜態檢查服務的測試：用 Pack 的 ci-fixtures 逐一送出，另用假的 Pack 測逾時、工具失敗與並行。

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  auth, check, checkSchema, EXPECTED, FAKE_PROLOGUE, FAKE_SECRET, fixture, FIXTURE_DIR, jsonHeaders, makeFakePack, PACK, randomToken, request,
  rm, sameSet, section, SERVICES, sleep, staticBody, tmp, waitFor,
} from './helpers.mjs';
import { createStaticService, STATIC_BLOCKING_CODES, truncateComment } from '../static-service.mjs';
import { createLogger, guardComment, ipAllowed, jsonDepthExceeds, parseCidrs } from '../shared.mjs';

const ALLOWED = new Set(STATIC_BLOCKING_CODES);

async function boot(extra = {}) {
  const logs = [];
  const workRoot = tmp('ci-static-work-');
  const token = randomToken();
  const svc = await createStaticService({
    packRoot: PACK, workRoot, tokens: [{ value: token, callerId: 'tester' }], port: 0, rateBurst: 100000, log: createLogger(l => logs.push(l), { service: 'static-check' }), ...extra,
  });
  const port = await svc.start();
  return { svc, port, token, logs, workRoot, async stop() { await svc.close(); rm(workRoot); } };
}

const post = (s, body, opts = {}) => request(s.port, { method: 'POST', path: '/v1/check/static', headers: opts.headers ?? jsonHeaders(opts.token ?? s.token), body, raw: opts.raw, chunks: opts.chunks });
const errCode = r => r.json?.error?.code;

export async function runStatic() {
  const fixtures = readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.json')).sort();

  await section('靜態：夾具逐一送出', async () => {
    const s = await boot();
    const h = await request(s.port, { path: '/healthz' });
    check(h.status === 200 && h.text === '{"status":"ok"}', 'healthz 應回 200 {"status":"ok"}');
    checkSchema('misc-responses', h.json, '#/$defs/healthz', 'healthz');

    for (const [file, exp] of Object.entries(EXPECTED.static)) {
      const body = staticBody([file, ...(exp.with ?? [])], { credentialMap: EXPECTED.credentialMap });
      const r = await post(s, body);
      check(r.status === 200, `${file}：應回 200，實際 ${r.status}`);
      if (r.status !== 200) continue;
      checkSchema('static-response', r.json, '#', file);
      check(r.json.requestId === body.requestId && r.headers['x-request-id'] === body.requestId, `${file}：requestId 應原樣帶回（本文與 X-Request-Id）`);
      check(r.headers['cache-control'] === 'no-store' && /application\/json; charset=utf-8/.test(r.headers['content-type']), `${file}：標頭應有 no-store 與 json utf-8`);
      const rep = r.json.report;
      check(rep.status === exp.status, `${file}：status 應為 ${exp.status}，實際 ${rep.status}`);
      const codes = rep.blocking.filter(b => b.file === `workflows/${file}`).map(b => b.code);
      check(sameSet(codes, exp.blocking), `${file}：阻擋碼應為 [${exp.blocking}]，實際 [${[...new Set(codes)]}]`);
      check(rep.blocking.every(b => ALLOWED.has(b.code)), `${file}：出現不在清單內的阻擋碼`);
      if (exp.advisories) {
        const adv = rep.advisories.filter(a => a.file === `workflows/${file}`).map(a => `${a.source}:${a.rule}`);
        check(sameSet(adv, exp.advisories), `${file}：建議項應為 [${exp.advisories}]，實際 [${adv}]`);
      }
      if (exp.status === 'pass') check(rep.blocking.length === 0 && rep.counts.blocking === 0, `${file}：pass 不應有阻擋項`);
      check(!('incomplete' in rep) && !('incomplete' in rep.counts), `${file}：report 不應含 Pack 內部的 incomplete 欄位`);
      check(typeof r.json.comment === 'string' && r.json.comment.split('\n')[0].includes('建議項不會讓 CI 失敗'), `${file}：註解第一行應說明建議項不會讓 CI 失敗`);
      check(r.json.packVersion === readFileSync(join(PACK, 'VERSION'), 'utf8').trim(), `${file}：packVersion 應等於 Pack 的 VERSION`);
    }

    // 整批：與直接跑 CLI 的 ci-report 內容相同
    const all = staticBody(fixtures, { credentialMap: EXPECTED.credentialMap });
    const r = await post(s, all);
    check(r.status === 200 && r.json.report.status === 'fail', `整批：應為 200 且 fail，實際 ${r.status}`);
    checkSchema('static-response', r.json, '#', '整批');
    for (const [file, exp] of Object.entries(EXPECTED.static)) {
      const codes = r.json.report.blocking.filter(b => b.file === `workflows/${file}`).map(b => b.code);
      check(sameSet(codes, exp.blocking), `整批：${file} 阻擋碼應為 [${exp.blocking}]，實際 [${[...new Set(codes)]}]`);
    }
    const dir = tmp('ci-cli-cmp-');
    mkdirSync(join(dir, 'in', 'workflows'), { recursive: true });
    for (const f of fixtures) writeFileSync(join(dir, 'in', 'workflows', f), fixture(f));
    writeFileSync(join(dir, 'map.json'), JSON.stringify(EXPECTED.credentialMap));
    const cli = spawnSync(process.execPath, [join(PACK, 'scripts', 'ci', 'check-workflows.mjs'), '--dir', join(dir, 'in'), '--target-version', EXPECTED.target, '--credential-map', join(dir, 'map.json'), '--out', join(dir, 'r.json')], { cwd: PACK, encoding: 'utf8' });
    const ref = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'));
    delete ref.counts.incomplete;
    check(cli.status === 1, 'CLI 整批應退出 1');
    check(JSON.stringify(r.json.report.blocking) === JSON.stringify(ref.blocking), '整批：blocking 與 CLI 不同');
    check(JSON.stringify(r.json.report.advisories) === JSON.stringify(ref.advisories), '整批：advisories 與 CLI 不同');
    check(JSON.stringify(r.json.report.counts) === JSON.stringify(ref.counts), '整批：counts 與 CLI 不同');
    check(r.json.report.target === ref.target, '整批：target 與 CLI 不同');
    rm(dir);

    // 建議項永遠不使狀態變 fail
    const adv = await post(s, staticBody(fixtures.filter(f => f.startsWith('advisory-')), { credentialMap: EXPECTED.credentialMap }));
    check(adv.json?.report.status === 'pass' && adv.json.report.blocking.length === 0 && adv.json.report.advisories.length >= 6, 'advisory 整批：應 pass、無阻擋項、有建議項');
    const mixed = await post(s, staticBody([...fixtures.filter(f => f.startsWith('advisory-')), 'fail-function-node.workflow.json']));
    check(mixed.json?.report.blocking.length === 1 && mixed.json.report.blocking[0].code === 'NODE_DEPRECATED', 'advisory 與 fail 同批：阻擋項只應有 NODE_DEPRECATED');

    // 選用欄位
    const dup = await post(s, staticBody(['pass-webhook-echo.workflow.json'], { existingWebhookPaths: ['ci-fixture-echo'] }));
    check(dup.json?.report.blocking.some(b => b.code === 'WEBHOOK_PATH_CONFLICT'), 'existingWebhookPaths：應出現 WEBHOOK_PATH_CONFLICT');
    const sub1 = await post(s, staticBody(['advisory-unknown-subworkflow.workflow.json']));
    const sub2 = await post(s, staticBody(['advisory-unknown-subworkflow.workflow.json'], { existingWorkflowIds: ['ci-missing-sub-0001'] }));
    check(sub1.json?.report.advisories.some(a => a.rule === 'workflow:unknown-subworkflow-reference') && !sub2.json?.report.advisories.some(a => a.rule === 'workflow:unknown-subworkflow-reference'), 'existingWorkflowIds：列出該 id 後不應再提示');
    const nomap = await post(s, staticBody(['fail-credential-missing.workflow.json']));
    check(nomap.json?.report.status === 'pass' && nomap.json.report.advisories.some(a => a.rule === 'credential-map-not-provided'), '省略 credentialMap：應 pass 並有 credential-map-not-provided 建議');
    const emptyMap = await post(s, staticBody(['fail-credential-missing.workflow.json'], { credentialMap: {} }));
    check(emptyMap.json?.report.blocking.some(b => b.code === 'CREDENTIAL_MISSING'), 'credentialMap 給 {}：應一律不允許憑證');
    const nc = await post(s, staticBody(['pass-webhook-echo.workflow.json'], { options: { includeComment: false } }));
    check(nc.json?.comment === null && nc.json.commentTruncated === false, 'includeComment=false：comment 應為 null');
    checkSchema('static-response', nc.json, '#', 'includeComment=false');

    // /version
    const noTok = await request(s.port, { path: '/version' });
    check(noTok.status === 401, '/version 沒有 token 應回 401');
    const ver = await request(s.port, { path: '/version', headers: auth(s.token) });
    checkSchema('misc-responses', ver.json, '#/$defs/staticVersion', '/version');
    check(sameSet(ver.json?.blockingCodes ?? [], STATIC_BLOCKING_CODES) && ver.json.blockingCodes.length === 10, '/version 的 blockingCodes 應為靜態 10 碼');
    check(ver.json?.supportedTargetVersions.includes('2.44.6'), '/version 應列出 2.44.6');

    check(readdirSync(s.workRoot).length === 0, '處理完成後暫存區應是空的');
    await s.stop();
  });

  await section('靜態：規格範例請求', async () => {
    const s = await boot();
    for (const [f, status, codes] of [['static-check.request.json', 'fail', ['NODE_DEPRECATED', 'CREDENTIAL_MISSING', 'WEBHOOK_PATH_CONFLICT']], ['static-check.request.pass.json', 'pass', []]]) {
      const body = JSON.parse(readFileSync(join(SERVICES, 'test', 'spec-examples', f), 'utf8'));
      checkSchema('static-request', body, '#', `${f}（請求範例本身）`);
      const r = await post(s, body);
      check(r.status === 200, `${f}：應回 200，實際 ${r.status}`);
      checkSchema('static-response', r.json, '#', f);
      check(r.json?.report.status === status && sameSet(r.json.report.blocking.map(b => b.code), codes), `${f}：status/阻擋碼應為 ${status}/[${codes}]，實際 ${r.json?.report.status}/[${r.json?.report.blocking.map(b => b.code)}]`);
    }
    await s.stop();
  });

  await section('靜態：錯誤碼與輸入檢核', async () => {
    const s = await boot();
    const ok = staticBody(['pass-webhook-echo.workflow.json']);

    let r = await request(s.port, { method: 'POST', path: '/v1/check/static', headers: { 'content-type': 'application/json' }, body: ok });
    check(r.status === 401 && errCode(r) === 'UNAUTHORIZED' && r.headers['www-authenticate'] === 'Bearer', '沒有 token：401 UNAUTHORIZED 並帶 WWW-Authenticate');
    checkSchema('error', r.json, '#', '401');
    r = await post(s, ok, { token: 'x'.repeat(40) });
    check(r.status === 401, '錯的 token：應回 401');
    r = await request(s.port, { method: 'POST', path: '/v1/check/static', headers: { 'content-type': 'application/json', authorization: `Basic ${s.token}` }, body: ok });
    check(r.status === 401, '非 Bearer 格式：應回 401');
    check(!r.text.includes(s.token), '401 回應不得回顯 token');

    r = await post(s, ok, { headers: { 'content-type': 'text/plain', ...auth(s.token) } });
    check(r.status === 415 && errCode(r) === 'UNSUPPORTED_MEDIA_TYPE', '非 JSON 的 Content-Type：應回 415');
    r = await post(s, ok, { headers: { ...jsonHeaders(s.token), 'content-encoding': 'gzip' } });
    check(r.status === 415, '帶 Content-Encoding：應回 415');

    r = await post(s, null, { raw: '{"requestId":' });
    check(r.status === 400 && errCode(r) === 'INVALID_JSON_BODY', '壞掉的 JSON：應回 400 INVALID_JSON_BODY');
    r = await post(s, null, { raw: Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x3a, 0x31, 0x7d]) });
    check(r.status === 400 && errCode(r) === 'INVALID_JSON_BODY', '不是 UTF-8：應回 400 INVALID_JSON_BODY');
    r = await post(s, null, { raw: `{"a":${'['.repeat(20)}${']'.repeat(20)}}` });
    check(r.status === 400 && errCode(r) === 'INVALID_JSON_BODY', '外層 JSON 巢狀超過 8 層：應回 400 INVALID_JSON_BODY');

    const bad = [
      ['未定義欄位', { ...ok, foo: 1 }], ['缺 requestId', { targetVersion: '2.44.6', workflows: ok.workflows }], ['requestId 太短', { ...ok, requestId: 'abc' }],
      ['requestId 有空白', { ...ok, requestId: 'abc def ghi' }], ['targetVersion 格式', { ...ok, targetVersion: '2.44' }], ['workflows 不是陣列', { ...ok, workflows: {} }],
      ['workflows 空陣列', { ...ok, workflows: [] }], ['options 未定義欄位', { ...ok, options: { failOnAdvisory: true } }], ['includeComment 型別', { ...ok, options: { includeComment: 'yes' } }],
      ['maxCommentChars 太小', { ...ok, options: { maxCommentChars: 10 } }], ['credentialMap 值不是陣列', { ...ok, credentialMap: { slackApi: 'x' } }],
      ['existingWebhookPaths 含非字串', { ...ok, existingWebhookPaths: [1] }], ['workflow 項目缺 content', { ...ok, workflows: [{ path: 'a.json' }] }],
      ['workflow 項目多欄位', { ...ok, workflows: [{ path: 'a.json', content: '{}', extra: 1 }] }], ['content 不是字串', { ...ok, workflows: [{ path: 'a.json', content: {} }] }],
    ];
    for (const [name, body] of bad) {
      r = await post(s, body);
      check(r.status === 400 && errCode(r) === 'INVALID_REQUEST', `${name}：應回 400 INVALID_REQUEST，實際 ${r.status} ${errCode(r)}`);
      checkSchema('error', r.json, '#', name);
    }
    r = await post(s, { ...ok, requestId: 'bad id with spaces', foo: 1 });
    check(r.json?.error.requestId === null, 'requestId 格式不合時，錯誤回應的 requestId 應為 null');
    r = await post(s, { ...ok, foo: 1 });
    check(r.json?.error.requestId === ok.requestId && r.headers['x-request-id'] === ok.requestId, '本文可解析時，錯誤回應應帶回 requestId');

    // path 規則
    const w = p => ({ ...ok, workflows: [{ path: p, content: '{"a":1}' }] });
    const badPaths = ['/abs/x.json', '../x.json', 'a/../x.json', '.hidden/x.json', 'a/.x.json', '.git/config.json', 'a//b.json', 'a\\b.json', 'a/b.txt', 'a/node_modules/b.json',
      'a/b\u0000.json', 'a/b\u001f.json', 'a/b\u007f.json', `${'x'.repeat(196)}.json`, '', 'x.json\n', 'a\u202eb.json', `a/${'é'.repeat(130)}.json`, 'a\u2028b.json', 'a/ .json/../x.json'];
    for (const p of badPaths) {
      r = await post(s, w(p));
      check(r.status === 400 && (errCode(r) === 'INVALID_PATH' || errCode(r) === 'INVALID_REQUEST'), `路徑 ${JSON.stringify(p).slice(0, 40)}：應被拒（400），實際 ${r.status} ${errCode(r)}`);
      if (p !== '') check(errCode(r) === 'INVALID_PATH', `路徑 ${JSON.stringify(p).slice(0, 40)}：應為 INVALID_PATH，實際 ${errCode(r)}`);
      check(!r.text.includes(p) || p.length < 3, `路徑 ${JSON.stringify(p).slice(0, 30)}：錯誤回應不得回顯路徑內容`);
    }
    r = await post(s, { ...ok, workflows: [{ path: 'a/b.json', content: '{"a":1}' }, { path: 'A/B.json', content: '{"a":1}' }] });
    check(r.status === 400 && errCode(r) === 'DUPLICATE_PATH', '路徑只差大小寫：應回 400 DUPLICATE_PATH');
    r = await post(s, { ...ok, workflows: [{ path: 'é.json', content: '{"a":1}' }, { path: 'é.json', content: '{"a":1}' }] });
    check(r.status === 400 && errCode(r) === 'DUPLICATE_PATH', 'NFC 正規化後相同的路徑：應回 400 DUPLICATE_PATH');
    r = await post(s, { ...ok, workflows: [{ path: 'a.json', content: '{"a":1}' }, { path: 'a.json/b.json', content: '{"a":1}' }] });
    check(r.status === 400 && errCode(r) === 'INVALID_PATH', '檔案名稱同時是另一個檔案的目錄：應回 400 INVALID_PATH');
    check(!existsSync(join(dirname(s.workRoot), 'x.json')) && readdirSync(s.workRoot).length === 0, '路徑穿越：暫存區之外不得出現檔案，暫存區也要是空的');
    // 隱藏路徑若放行會被 Pack 靜默略過（等於繞過檢查）：確認它們被擋在入口，而不是回 pass
    r = await post(s, w('.hidden/evil.json'));
    check(r.status === 400, '隱藏路徑不得回 200（否則檔案會被 Pack 略過而不被檢查）');

    // 大小與數量
    r = await post(s, { ...ok, workflows: Array.from({ length: 51 }, (_, i) => ({ path: `f${i}.json`, content: '{"a":1}' })) });
    check(r.status === 413 && errCode(r) === 'TOO_MANY_FILES', '51 個檔案：應回 413 TOO_MANY_FILES');
    r = await post(s, { ...ok, workflows: [{ path: 'big.json', content: `{"a":"${'x'.repeat(1048576)}"}` }] });
    check(r.status === 413 && errCode(r) === 'FILE_TOO_LARGE', '單檔超過 1 MB：應回 413 FILE_TOO_LARGE');
    r = await post(s, null, { raw: 'x'.repeat(6 * 1024 * 1024) });
    check(r.status === 413 && errCode(r) === 'PAYLOAD_TOO_LARGE', 'Content-Length 超過 5 MB：應回 413 PAYLOAD_TOO_LARGE');
    checkSchema('error', r.json, '#', '413');
    const chunk = Buffer.alloc(1024 * 1024, 120);
    r = await post(s, null, { chunks: Array.from({ length: 7 }, () => chunk) });
    check(r.status === 413 || r.error, '分塊傳輸超過 5 MB：應回 413（或在讀到上限時中止連線）');
    r = await post(s, { ...ok, targetVersion: '9.9.9' });
    check(r.status === 422 && errCode(r) === 'NODE_CATALOG_MISSING', '沒有節點目錄的版本：應回 422 NODE_CATALOG_MISSING');

    r = await request(s.port, { path: '/nope', headers: auth(s.token) });
    check(r.status === 404 && errCode(r) === 'NOT_FOUND', '未知路徑：應回 404 NOT_FOUND');
    r = await request(s.port, { method: 'GET', path: '/v1/check/static', headers: auth(s.token) });
    check(r.status === 404, '錯的方法：應回 404');

    // 深度與節點數：回 200 並產生阻擋項
    const deep = `${'['.repeat(150)}${']'.repeat(150)}`;
    const many = JSON.stringify({ name: 'many', nodes: Array.from({ length: 2001 }, (_, i) => ({ name: `n${i}`, type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [0, 0], parameters: {} })), connections: {} });
    r = await post(s, { ...ok, workflows: [{ path: 'deep.json', content: deep }, { path: 'many.json', content: many }, { path: 'fine.json', content: fixture('pass-manual-set.workflow.json') }] });
    check(r.status === 200, `深層與大量節點：應回 200，實際 ${r.status}`);
    checkSchema('static-response', r.json, '#', '深層與大量節點');
    const b = r.json?.report.blocking ?? [];
    check(b.some(x => x.file === 'deep.json' && x.code === 'JSON_INVALID' && x.message.includes('巢狀過深')), '巢狀超過 100 層：應產生 JSON_INVALID（巢狀過深）');
    check(b.some(x => x.file === 'many.json' && x.code === 'STRUCTURE_INVALID' && x.message.includes('節點數過多')), '節點超過 2000：應產生 STRUCTURE_INVALID（節點數過多）');
    check(b.length === 2 && r.json?.report.counts.files === 3 && r.json.report.counts.filesWithBlocking === 2, '深層與大量節點：只有兩個檔案有阻擋項，counts.files 應為 3');
    check(r.json?.comment.includes('節點數過多') && r.json.comment.includes('巢狀過深'), '深層與大量節點：註解應反映這兩項');

    // 註解截斷：阻擋項保留，建議項由後往前截
    const names = fixtures.filter(f => f.startsWith('advisory-'));
    const manyWf = Array.from({ length: 40 }, (_, i) => ({ path: `w/${i}.json`, content: fixture(names[i % names.length]) }));
    manyWf.push({ path: 'w/blocked.json', content: fixture('fail-function-node.workflow.json') });
    r = await post(s, { ...ok, workflows: manyWf, options: { maxCommentChars: 2000 } });
    check(r.status === 200 && r.json.commentTruncated === true, '註解超過 maxCommentChars：commentTruncated 應為 true');
    check(r.json?.comment.includes('### 阻擋項') && r.json.comment.includes('NODE_DEPRECATED') && r.json.comment.includes('建議項過多已截斷'), '截斷後阻擋項要完整保留並加註記');
    check(r.json?.report.advisories.length > 20, '截斷註解不影響 report.advisories 的完整性');
    checkSchema('static-response', r.json, '#', '截斷註解');

    // 惡意檔名／節點名稱：註解不得出現未跳脫的連結、圖片、@、角括號
    const evilName = 'a[x](http_evil.invalid_p)`<b>@admin#12.json';
    r = await post(s, { ...ok, workflows: [{ path: evilName, content: fixture('fail-hostile-names.workflow.json') }, { path: `${'L'.repeat(190)}.json`, content: fixture('fail-hostile-names.workflow.json') }] });
    check(r.status === 200 && r.json.report.status === 'fail', '惡意名稱：應回 200 且 fail');
    const cm = r.json?.comment ?? '';
    for (const badText of ['](http', '[x]', '@admin', '@all', 'www.evil', '://evil', 'A'.repeat(201), 'L'.repeat(201)]) check(!cm.includes(badText), `惡意名稱：註解仍含未跳脫的「${badText.slice(0, 20)}」`);
    check(!cm.split('\n').some(l => /^\s*#+ 假標題/.test(l)), '惡意名稱：換行不應讓內容成為獨立的標題');
    check(r.json?.report.blocking.every(x => (x.file ?? '').length <= 201 && (x.node ?? '').length <= 201 && x.message.length <= 201), '惡意名稱：file/node/message 長度應 ≤ 201');

    check(readdirSync(s.workRoot).length === 0, '錯誤路徑結束後暫存區應是空的');
    await s.stop();
  });

  await section('靜態：認證封鎖、來源、速率、並行', async () => {
    // 連續失敗封鎖
    let s = await boot({ authFailLimit: 3, authBlockMs: 900 });
    const ok = staticBody(['pass-webhook-echo.workflow.json']);
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await post(s, ok, { token: 'y'.repeat(40) })).status);
    check(codes.join() === '401,401,401', `連續 3 次錯誤 token：應都是 401，實際 ${codes}`);
    let r = await post(s, ok);
    check(r.status === 429 && errCode(r) === 'RATE_LIMITED' && Number(r.headers['retry-after']) >= 1, '達到失敗上限後，連有效 token 也應被封鎖（429＋Retry-After）');
    await sleep(1000);
    r = await post(s, ok);
    check(r.status === 200, `封鎖時間過後，有效 token 應可使用，實際 ${r.status}`);
    await s.stop();

    // 來源白名單
    s = await boot({ cidrs: parseCidrs('203.0.113.0/24') });
    r = await post(s, ok);
    check(r.status === 403 && errCode(r) === 'FORBIDDEN', '來源不在白名單：應回 403 FORBIDDEN');
    r = await request(s.port, { path: '/healthz' });
    check(r.status === 200, 'healthz 不受白名單影響');
    await s.stop();
    s = await boot({ cidrs: parseCidrs('127.0.0.0/8') });
    r = await post(s, ok);
    check(r.status === 200, '來源在白名單內：應可使用');
    await s.stop();
    check(ipAllowed(parseCidrs('198.51.100.0/24'), '198.51.100.77') && !ipAllowed(parseCidrs('198.51.100.0/24'), '198.51.101.1') && !ipAllowed(parseCidrs('198.51.100.0/24'), '::2'), 'CIDR 比對');

    // 速率：突發 3
    s = await boot({ rateBurst: 3, ratePerMinute: 60 });
    const rs = [];
    for (let i = 0; i < 6; i++) rs.push(await post(s, {}));
    check(rs.slice(0, 3).every(x => x.status === 400) && rs.slice(3).some(x => x.status === 429 && errCode(x) === 'RATE_LIMITED' && x.headers['retry-after']), `速率限制：前 3 次通過、之後出現 429＋Retry-After，實際 ${rs.map(x => x.status)}`);
    await s.stop();
  });

  await section('靜態：假的 Pack（逾時、工具失敗、並行、環境變數）', async () => {
    const base = tmp('ci-fakepack-');
    const mk = (name, script) => makeFakePack(join(base, name), script);
    const pidFile = join(base, 'child.pid');
    const envFile = join(base, 'env.txt');
    const okReport = "writeFileSync(out, JSON.stringify(report())); if (cm) writeFileSync(cm, '> 建議項不會讓 CI 失敗；只有阻擋項會使檢查失敗。\\n\\n## n8n workflow CI 報告\\n');";
    const packs = {
      sleep: mk('sleep', `${FAKE_PROLOGUE}
import { spawn } from 'node:child_process';
const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));
setTimeout(() => {}, 60000);`),
      exit2: mk('exit2', `console.error('錯誤：security-scan.mjs 執行失敗 STDERR-MARKER-9f3'); process.exit(2);`),
      badcode: mk('badcode', `${FAKE_PROLOGUE}
writeFileSync(out, JSON.stringify(report({ status: 'fail', blocking: [{ code: 'TOTALLY_NEW_CODE', file: 'a.json', node: null, message: 'x' }] }))); process.exit(1);`),
      inconsistent: mk('inconsistent', `${FAKE_PROLOGUE}
writeFileSync(out, JSON.stringify(report({ status: 'pass', blocking: [{ code: 'JSON_INVALID', file: 'a.json', node: null, message: 'x' }] }))); process.exit(0);`),
      noreport: mk('noreport', 'process.exit(0);'),
      hostile: mk('hostile', `${FAKE_PROLOGUE}
writeFileSync(out, JSON.stringify(report()));
writeFileSync(cm, ['> 建議項不會讓 CI 失敗；只有阻擋項會使檢查失敗。', '', '## n8n workflow CI 報告', '', '| 代碼 | 檔案 | 節點 | 說明 |', '|---|---|---|---|', '| \`JSON_INVALID\` | a.json | ![x](http://evil.invalid/p.png) @admin <b>#12 | ok |', '| \`JSON_INVALID\` | b.json | fine | 正常的一列 |', ''].join('\\n'));`),
      env: mk('env', `${FAKE_PROLOGUE}
writeFileSync(${JSON.stringify(envFile)}, Object.keys(process.env).sort().join('\\n') + '\\nTMPDIR=' + process.env.TMPDIR);
${okReport}`),
      slow: mk('slow', `${FAKE_PROLOGUE}
await new Promise(r => setTimeout(r, 800));
${okReport}`),
    };
    const one = staticBody(['pass-webhook-echo.workflow.json']);
    const mkSvc = async (name, extra = {}) => boot({ packRoot: packs[name], timeoutMs: 600, ...extra });

    let s = await mkSvc('sleep');
    let r = await post(s, one);
    check(r.status === 504 && errCode(r) === 'CHECK_TIMEOUT' && r.json.error.retryable === true, `Pack 超時：應回 504 CHECK_TIMEOUT，實際 ${r.status}`);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    await sleep(200);
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    check(!alive, '逾時後 Pack 開出的子行程也應被殺掉（行程群組擊殺）');
    check(readdirSync(s.workRoot).length === 0, '逾時後暫存區應是空的');
    await s.stop();

    s = await mkSvc('exit2');
    r = await post(s, one);
    check(r.status === 500 && errCode(r) === 'CHECK_TOOL_FAILED' && r.json.error.details.tool === 'security-scan', `工具失敗：應回 500 CHECK_TOOL_FAILED 並指出子工具，實際 ${r.status} ${JSON.stringify(r.json?.error.details)}`);
    check(!r.text.includes('STDERR-MARKER') && !s.logs.join('\n').includes('STDERR-MARKER'), '工具失敗：stderr 原文不得出現在回應或記錄');
    check(readdirSync(s.workRoot).length === 0, '工具失敗後暫存區應是空的');
    await s.stop();

    for (const name of ['badcode', 'inconsistent', 'noreport']) {
      s = await mkSvc(name);
      r = await post(s, one);
      check(r.status === 500 && errCode(r) === 'CHECK_TOOL_FAILED', `${name}：不可信的 Pack 輸出應回 500（不可放行），實際 ${r.status}`);
      await s.stop();
    }

    s = await mkSvc('hostile');
    r = await post(s, one);
    check(r.status === 200 && r.json.comment.includes('| `![x](http://evil.invalid/p.png) @admin <b>#12` |') && !r.json.comment.includes('| ![x]'), '縱深防禦：有未跳脫危險字元的儲存格應整個改成代碼區塊');
    check(r.json.comment.includes('正常的一列'), '縱深防禦：正常的列不受影響');
    check(s.logs.some(l => l.includes('comment-guard')), '縱深防禦：應記一則稽核事件');
    await s.stop();

    // 子行程不得繼承 token 等環境變數
    const secretEnv = 'SECRET_PROBE_ENV';
    process.env[secretEnv] = 'probe-value-1';
    process.env.STATIC_API_TOKEN_CURRENT = randomToken();
    s = await mkSvc('env', { timeoutMs: 5000 });
    r = await post(s, one);
    delete process.env.STATIC_API_TOKEN_CURRENT; delete process.env[secretEnv];
    const envText = readFileSync(envFile, 'utf8');
    check(r.status === 200 && !envText.includes('STATIC_API_TOKEN') && !envText.includes(secretEnv) && envText.includes('TMPDIR='), 'Pack 子行程的環境變數只應有白名單（不含 token 與其他環境變數）');
    await s.stop();

    // 並行：1 個執行、佇列 1、等 300 ms
    s = await boot({ packRoot: packs.slow, maxConcurrent: 1, queueMax: 1, queueWaitMs: 300, timeoutMs: 5000 });
    let rs = await Promise.all([0, 1, 2, 3].map(() => post(s, one)));
    let st = rs.map(x => x.status).sort();
    check(st.filter(x => x === 200).length === 1 && st.filter(x => x === 429).length === 3 && rs.filter(x => x.status === 429).every(x => errCode(x) === 'RATE_LIMITED' && x.headers['retry-after']), `並行上限（等待 300 ms）：應 1 個 200、3 個 429，實際 ${st}`);
    await s.stop();
    s = await boot({ packRoot: packs.slow, maxConcurrent: 1, queueMax: 1, queueWaitMs: 5000, timeoutMs: 5000 });
    rs = await Promise.all([0, 1, 2].map(() => post(s, one)));
    st = rs.map(x => x.status).sort();
    check(st.join() === '200,200,429', `並行上限（佇列 1、可等待）：應 200,200,429，實際 ${st}`);
    await s.stop();
    rm(base);
  });

  await section('靜態：真實行程（環境變數、啟動檢查、記錄與 token）', async () => {
    const token = randomToken();
    const workRoot = tmp('ci-static-proc-');
    const run = (env) => spawn(process.execPath, [join(SERVICES, 'static-service.mjs')], { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = child => { const o = { out: '', err: '' }; child.stdout.on('data', d => { o.out += d; }); child.stderr.on('data', d => { o.err += d; }); return o; };
    const exited = child => new Promise(r => child.on('exit', code => r(code)));

    let c = run({ PORT: '0', WORK_ROOT: workRoot });
    let o = collect(c);
    check(await exited(c) === 2 && /STATIC_API_TOKEN_CURRENT/.test(o.err), '沒有設定 token：服務應拒絕啟動（退出碼 2）');
    const shortTok = 'short-token-value';
    c = run({ PORT: '0', WORK_ROOT: workRoot, STATIC_API_TOKEN_CURRENT: shortTok });
    o = collect(c);
    check(await exited(c) === 2 && !o.err.includes(shortTok) && !o.out.includes(shortTok), 'token 太短：應拒絕啟動，且不回顯 token');

    c = run({ PORT: '0', HOST: '127.0.0.1', WORK_ROOT: workRoot, STATIC_API_TOKEN_CURRENT: token, ALLOWED_SOURCE_CIDRS: '127.0.0.0/8' });
    o = collect(c);
    const port = await waitFor(() => { const m = /"event":"startup".*"port":(\d+)/.exec(o.out); return m ? Number(m[1]) : null; }, 8000);
    check(Boolean(port), '真實行程：應在 stdout 輸出 startup 記錄與埠號');
    if (port) {
      const body = JSON.parse(readFileSync(join(SERVICES, 'test', 'spec-examples', 'static-check.request.json'), 'utf8'));
      const r = await request(port, { method: 'POST', path: '/v1/check/static', headers: jsonHeaders(token), body });
      check(r.status === 200, `真實行程：範例請求應回 200，實際 ${r.status}`);
      checkSchema('static-response', r.json, '#', '真實行程');
      await request(port, { method: 'POST', path: '/v1/check/static', headers: jsonHeaders('z'.repeat(40)), body });
      const v = await request(port, { path: '/version', headers: auth(token) });
      check(v.status === 200, '真實行程：/version 帶 token 應回 200');
    }
    c.kill('SIGTERM');
    const code = await exited(c);
    check(code === 0, `SIGTERM 後應正常結束，實際 ${code}`);
    const all = `${o.out}\n${o.err}`;
    check(!all.includes(token) && !all.toLowerCase().includes('bearer'), '記錄（stdout／stderr）不得含 token 或 Authorization 內容');
    check(!all.includes('Old Function') && !all.includes('Webhook 沒有設定認證') && !all.includes('slackApi'), '記錄不得含節點名稱、message 全文或 credentialMap 內容');
    check(/"event":"request"/.test(all) && /"requestId"/.test(all) && /workflows\//.test(all), '記錄應有 requestId 與檔名');
    check(readdirSync(workRoot).length === 0, '真實行程：暫存區應是空的');
    rm(workRoot);
  });

  await section('靜態：共用函式', async () => {
    check(jsonDepthExceeds('['.repeat(101) + ']'.repeat(101), 100) && !jsonDepthExceeds('['.repeat(100) + ']'.repeat(100), 100), 'jsonDepthExceeds 邊界');
    check(!jsonDepthExceeds('{"a":"[[[[[[[[[[[[[[[[[[[[[[["}', 3) && !jsonDepthExceeds('{"a":"\\"[[[[[[[["}', 2), 'jsonDepthExceeds 不計字串內的括號');
    const g = guardComment('| a | b |\n|---|---|\n| `X` | [t](http://e.invalid) |\n| `Y` | 安全 \\[文字\\] |\n');
    check(g.hits === 1 && g.comment.includes('| `X` | `[t](http://e.invalid)` |') && g.comment.includes('安全 \\[文字\\]'), 'guardComment：只改危險的列');
    check(guardComment('| a |\n|---|\n| `x@y` |\n').hits === 0, 'guardComment：行內程式碼內的 @ 不算');
    check(guardComment('| a |\n|---|\n| @admin |\n').hits === 1, 'guardComment：@ 後沒有零寬空白算危險');
    const long = `head\n### 建議項（9）\n\n以下只是提醒\n\n#### A（3）\n\n${'x'.repeat(500)}\n\n#### B（3）\n\n${'y'.repeat(500)}\n`;
    const t = truncateComment(long, 800);
    check(t.truncated && t.comment.includes('#### A') && !t.comment.includes('#### B') && t.comment.includes('建議項過多已截斷'), 'truncateComment：由後往前截斷');
    check(truncateComment('short', 2000).truncated === false, 'truncateComment：沒超過就原樣');
    let thrown = false;
    try { parseCidrs('999.1.1.1/8'); } catch { thrown = true; }
    check(thrown, 'parseCidrs：格式錯誤應丟例外');
  });
}
