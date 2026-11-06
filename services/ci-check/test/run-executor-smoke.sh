#!/usr/bin/env bash
# 執行器容器煙霧測試：建映像、在 --network none 等限制下跑一個 job、檢查 result.json 與容器旗標、確認無法對外連線。
# 用法：bash services/ci-check/test/run-executor-smoke.sh [n8n版本，預設 2.44.6]
# 每次最多同時存在一個執行器容器；只在 free -m 的 available >= 9000 MiB 時執行（不足先等 60 秒再量一次，仍不足就跳過）。
# 不 pull 映像：本機要先有 docker.n8n.io/n8nio/n8n:<版本>。容器一律 docker run --rm，不使用 docker rm。
# 退出碼：0 全過或跳過（會印出 SKIP）；1 有失敗。

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACK="$(cd "$HERE/../../.." && pwd)"
VERSION="${1:-2.44.6}"
IMAGE="p0-ci-executor:test"
NAME="p0-ci-exec-smoke"
MIN_AVAILABLE=9000
fail=0
pass() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fail=1; }

available() { free -m | awk '/^Mem:/ {print $7}'; }
avail="$(available)"
if [ "$avail" -lt "$MIN_AVAILABLE" ]; then
  echo "available=${avail} MiB 低於 ${MIN_AVAILABLE}，等 60 秒再量一次"
  sleep 60
  avail="$(available)"
  if [ "$avail" -lt "$MIN_AVAILABLE" ]; then echo "SKIP 記憶體仍不足（available=${avail} MiB，需要 >= ${MIN_AVAILABLE}）"; exit 0; fi
fi
echo "available=${avail} MiB，開始"

command -v docker >/dev/null || { echo "SKIP 找不到 docker"; exit 0; }
docker image inspect "docker.n8n.io/n8nio/n8n:${VERSION}" >/dev/null 2>&1 || { echo "SKIP 本機沒有 docker.n8n.io/n8nio/n8n:${VERSION}（本腳本不會 pull）"; exit 0; }
if [ -n "$(docker ps -q --filter name=p0-ci-)" ]; then echo "SKIP 已有 p0-ci- 開頭的容器在跑（一次最多一個）"; exit 0; fi

SLOT="$(mktemp -d)"
LOGF="$(mktemp)"
cleanup() { rm -rf "${SLOT:-}" "${LOGF:-}"; }
trap cleanup EXIT

docker build --pull=false -q -f "$PACK/services/ci-check/executor/Dockerfile.executor" --build-arg "N8N_VERSION=${VERSION}" -t "$IMAGE" "$PACK" >/dev/null \
  && pass "映像建置（不需網路）" || { bad "映像建置失敗"; exit 1; }

FLAGS=(--network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=256m --cap-drop ALL --security-opt no-new-privileges
  --cpus 1 --memory 1g --memory-swap 1g --pids-limit 512 --ulimit nofile=4096:4096 --user "$(id -u):$(id -g)")

docker run --rm --name "$NAME" "${FLAGS[@]}" -v "$SLOT:/slot" "$IMAGE" >"$LOGF" 2>&1 &
RUNPID=$!

# 等執行器宣告 idle（前端也是這樣才放 job）
ready=0
for _ in $(seq 1 30); do
  if grep -q '"phase":"idle"' "$SLOT/status.json" 2>/dev/null; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] && pass "執行器進入 idle" || { bad "執行器沒有進入 idle"; docker stop "$NAME" >/dev/null 2>&1; wait "$RUNPID"; exit 1; }

node "$HERE/executor-smoke-helper.mjs" make-job "$SLOT" "$VERSION"

# 只取旗標欄位，不印環境變數
insp="$(docker inspect --format '{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.CapDrop}}|{{.HostConfig.SecurityOpt}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.Memory}}|{{.Config.User}}|{{.HostConfig.Privileged}}|{{len .HostConfig.Binds}}' "$NAME" 2>/dev/null)"
IFS='|' read -r net ro cap sec pids mem user priv binds <<<"$insp"
[ "$net" = "none" ] && pass "NetworkMode=none" || bad "NetworkMode=$net"
[ "$ro" = "true" ] && pass "ReadonlyRootfs=true" || bad "ReadonlyRootfs=$ro"
[[ "$cap" == *ALL* ]] && pass "CapDrop 含 ALL" || bad "CapDrop=$cap"
[[ "$sec" == *no-new-privileges* ]] && pass "SecurityOpt 含 no-new-privileges" || bad "SecurityOpt=$sec"
[ "$pids" = "512" ] && pass "PidsLimit=512" || bad "PidsLimit=$pids"
[ "$mem" = "1073741824" ] && pass "Memory=1g" || bad "Memory=$mem"
[ -n "$user" ] && [ "$user" != "root" ] && [ "${user%%:*}" != "0" ] && pass "非 root（User=$user）" || bad "User=$user"
[ "$priv" = "false" ] && [ "$binds" = "1" ] && pass "非特權，只有一個掛載（slot）" || bad "Privileged=$priv Binds=$binds"

done_=0
for _ in $(seq 1 60); do
  if [ -f "$SLOT/result.json" ] && grep -q '"phase":"done"' "$SLOT/status.json" 2>/dev/null; then done_=1; break; fi
  sleep 2
done
[ "$done_" = 1 ] && pass "result.json 與 phase=done 已產生" || bad "120 秒內沒有產生結果"

wait "$RUNPID"; rc=$?
[ "$rc" = 0 ] && pass "容器處理完一個 job 後以 0 結束" || bad "容器退出碼 $rc"
[ ! -e "$SLOT/job.json" ] && pass "job.json 已刪除（workflow 原文不留）" || bad "job.json 仍在"

if [ -f "$SLOT/result.json" ]; then
  out="$(node "$HERE/executor-smoke-helper.mjs" check "$SLOT" "$VERSION")"
  case "$out" in OK*) pass "結果通過前端檢核並符合預期（$out）" ;; *) bad "$out" ;; esac
fi
extra="$(ls "$SLOT" | grep -v -x -e result.json -e status.json || true)"
[ -z "$extra" ] && pass "slot 內只剩 result.json 與 status.json" || bad "slot 內有多餘檔案：$extra"
grep -q -E 'N8N_ENCRYPTION_KEY|password' "$SLOT/result.json" "$SLOT/status.json" 2>/dev/null && bad "結果或狀態檔含有金鑰或密碼字樣" || pass "結果與狀態檔不含金鑰或密碼字樣"

# 同樣旗標再起一個容器（上一個已結束，所以仍是一次一個）：只有 loopback，對外連線與 DNS 都要失敗
probe='
const os = require("os"), dns = require("dns"), net = require("net");
const nics = Object.keys(os.networkInterfaces());
const s = net.connect({ host: "192.0.2.1", port: 80, timeout: 3000 });
const conn = new Promise(r => { s.on("connect", () => r("connected")); s.on("error", e => r("error:" + e.code)); s.on("timeout", () => r("timeout")); });
const lookup = new Promise(r => dns.lookup("example.invalid", e => r(e ? "error:" + e.code : "resolved")));
Promise.all([conn, lookup]).then(([c, d]) => { console.log(JSON.stringify({ nics, connect: c, dns: d })); s.destroy(); });'
pr="$(docker run --rm --name "${NAME}-net" "${FLAGS[@]}" --entrypoint node "$IMAGE" -e "$probe" 2>&1 | tail -n 1)"
if [ "$pr" != "" ] && node -e 'const j=JSON.parse(process.argv[1]); process.exit(j.nics.length===1&&j.nics[0]==="lo"&&j.connect.startsWith("error:")&&j.dns.startsWith("error:")?0:1)' "$pr" 2>/dev/null; then
  pass "容器內只有 lo，對外連線與 DNS 皆失敗（$pr）"
else
  bad "網路探測結果不符預期：$pr"
fi

[ "$fail" = 0 ] && echo "SMOKE OK" || echo "SMOKE FAIL"
exit "$fail"
