// 私有網段限制（D-AI-04：評測流量不送外部雲端）與只連得上通過檢查的位址的 HTTP 用戶端。
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export function parseIPv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s));
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every(x => x >= 0 && x <= 255) ? p : null;
}

export function isPrivateIPv4(s) {
  const p = parseIPv4(s);
  if (!p) return false;
  const [a, b] = p;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// 展開成 8 個 16 位元的數字；格式不對回傳 null
export function expandIPv6(input) {
  let s = String(input).split('%')[0].toLowerCase();
  if (!net.isIPv6(s)) return null;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const p = parseIPv4(v4[1]);
    if (!p) return null;
    s = s.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const fill = s.includes('::') ? 8 - h.length - t.length : 0;
  if (fill < 0) return null;
  const parts = [...h, ...Array(fill).fill('0'), ...t];
  if (parts.length !== 8) return null;
  const nums = parts.map(x => parseInt(x, 16));
  return nums.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? nums : null;
}

export function isPrivateIPv6(s) {
  const w = expandIPv6(s);
  if (!w) return false;
  if (w.slice(0, 7).every(x => x === 0) && w[7] === 1) return true; // ::1
  if (w.slice(0, 5).every(x => x === 0) && w[5] === 0xffff) {        // ::ffff:a.b.c.d
    return isPrivateIPv4(`${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`);
  }
  return false;
}

export function isPrivateAddress(ip) {
  const s = String(ip).replace(/^\[|\]$/g, '');
  if (net.isIPv4(s)) return isPrivateIPv4(s);
  if (net.isIPv6(s)) return isPrivateIPv6(s);
  return false;
}

const defaultResolver = host => dns.promises.lookup(host, { all: true, verbatim: true });

export const EXTERNAL_REFUSAL =
  '位址不在允許範圍：依 D-AI-04，評測流量不送外部雲端，只允許 localhost 或私有網段' +
  '(10/8、172.16/12、192.168/16、127/8、：:1；主機名稱須解析到上述位址）。' +
  '確有需要請由人明確加上 --allow-external。';

// 回傳 { ok, external, hostname, addresses, reason }
export async function checkTargetUrl(urlStr, { allowExternal = false, resolver = defaultResolver, label = '網址' } = {}) {
  let url;
  try { url = new URL(urlStr); } catch { return { ok: false, reason: `${label} 不是合法網址` }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: `${label} 只接受 http 或 https` };
  if (url.username || url.password) return { ok: false, reason: `${label} 不可內含帳號或密碼` };
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) return { ok: false, reason: `${label} 缺少主機` };

  let addresses;
  if (net.isIP(hostname)) addresses = [hostname];
  else {
    try {
      const list = await resolver(hostname, { all: true });
      addresses = list.map(a => a.address);
    } catch {
      return { ok: false, reason: `${label} 的主機名稱無法解析` };
    }
    if (addresses.length === 0) return { ok: false, reason: `${label} 的主機名稱無法解析` };
  }
  const allPrivate = addresses.every(isPrivateAddress);
  if (allPrivate) return { ok: true, external: false, hostname, addresses };
  if (allowExternal) return { ok: true, external: true, hostname, addresses };
  return { ok: false, external: true, hostname, addresses, reason: `${label} 指向公網位址。${EXTERNAL_REFUSAL}` };
}

// 連線當下再檢查一次解析結果，避免檢查之後 DNS 改指別處
export function makeGuardedLookup({ allowExternal = false, resolver = defaultResolver } = {}) {
  return (hostname, options, cb) => {
    if (typeof options === 'function') { cb = options; options = {}; }
    resolver(hostname, { all: true }).then(list => {
      if (!allowExternal && !list.every(a => isPrivateAddress(a.address))) {
        cb(new Error('連線被拒：主機解析到非私有位址'));
        return;
      }
      if (options && options.all) cb(null, list);
      else cb(null, list[0].address, list[0].family);
    }, err => cb(err));
  };
}

// 不跟隨轉址；回應大小與時間皆有上限。回傳 { status, headers, text }
export function postJson(urlStr, body, { headers = {}, timeoutMs = 120000, maxBytes = 8 * 1024 * 1024, allowExternal = false, resolver } = {}) {
  const url = new URL(urlStr);
  const mod = url.protocol === 'https:' ? https : http;
  const payload = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
    const req = mod.request({
      method: 'POST',
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: { 'content-type': 'application/json', 'content-length': payload.length, accept: 'application/json', ...headers },
      lookup: makeGuardedLookup({ allowExternal, resolver }),
      agent: false,
    }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > maxBytes) { req.destroy(); done(reject, Object.assign(new Error('回應超過大小上限'), { code: 'TOO_LARGE' })); return; }
        chunks.push(c);
      });
      res.on('end', () => done(resolve, { status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', e => done(reject, e));
    });
    const timer = setTimeout(() => {
      req.destroy();
      done(reject, Object.assign(new Error(`逾時（${timeoutMs} 毫秒)`), { code: 'TIMEOUT' }));
    }, timeoutMs);
    req.on('error', e => done(reject, e));
    req.end(payload);
  });
}
