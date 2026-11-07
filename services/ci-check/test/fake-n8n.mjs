// 執行器單元測試用的假 n8n：只回 /healthz 與 /rest/settings。用法：node fake-n8n.mjs <環境變數名稱輸出檔> [boot-fail]
import http from 'node:http';
import { writeFileSync } from 'node:fs';

if (process.argv[2]) writeFileSync(process.argv[2], `${Object.keys(process.env).sort().join('\n')}\nKEYLEN=${(process.env.N8N_ENCRYPTION_KEY ?? '').length}\n`);
if (process.argv[3] === 'boot-fail') process.exit(1);
const port = Number(process.env.N8N_PORT);
http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); res.end('{"status":"ok"}'); return; }
  if (req.url === '/rest/settings') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"data":{"versionCli":"0.0.0-fake"}}'); return; }
  res.writeHead(404); res.end();
}).listen(port, '127.0.0.1');
