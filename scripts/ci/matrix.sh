#!/usr/bin/env bash
# 對多個 n8n 版本各起一個全新、可丟棄的容器，跑 run-on-n8n.mjs --bootstrap，匯整成對照表。
#
# 用法：
#   bash scripts/ci/matrix.sh --dir <workflows目錄> [--versions "2.37.3 2.44.6 2.46.6"] [--out-dir <目錄>] [--image <映像名稱，預設 docker.n8n.io/n8nio/n8n>]
#                              [--offline] [--workflow-timeout <秒>]
# 產出（在 --out-dir，預設目前目錄）：ci-report-<版本>.json、matrix-report.json、matrix-report.md
# 退出碼：0 各版本都沒有阻擋項；1 有版本出現阻擋項；2 使用錯誤、找不到映像或實例起不來。
# 容器用 docker run --rm 起、只綁 127.0.0.1 隨機 port；結束（含中斷）時 docker stop，--rm 會自動移除。
# --offline：容器用 --network none（不綁 port、不連外），腳本以 docker cp 放進容器，在容器內用 docker exec 跑 run-on-n8n.mjs；
#   適合不想讓假憑證對外部服務（Telegram、Slack 等）發出請求的環境。
# 找不到映像時直接報錯，不自動拉取。資料目錄是 mktemp -d 的空目錄，結束時刪除。

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR=""
VERSIONS="2.37.3 2.44.6 2.46.6"
OUT_DIR="."
IMAGE="docker.n8n.io/n8nio/n8n"
OFFLINE=0
WF_TIMEOUT=""

die() { echo "錯誤：$*" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="${2:-}"; shift 2 ;;
    --versions) VERSIONS="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --image) IMAGE="${2:-}"; shift 2 ;;
    --offline) OFFLINE=1; shift ;;
    --workflow-timeout) WF_TIMEOUT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "不認得的參數：$1" ;;
  esac
done

[ -n "$DIR" ] || die "缺少 --dir"
[ -d "$DIR" ] || die "找不到目錄：$DIR"
command -v docker >/dev/null || die "找不到 docker"
command -v node >/dev/null || die "找不到 node"
mkdir -p "$OUT_DIR"

for v in $VERSIONS; do
  docker image inspect "$IMAGE:$v" >/dev/null 2>&1 || die "本機沒有映像 $IMAGE:$v（本腳本不會自動拉取，請先自行取得）"
done

RUN_ID="$(node -e "process.stdout.write(require('crypto').randomBytes(3).toString('hex'))")"
CONTAINERS=()
TMPDIRS=()
FIRST_VERSION="${VERSIONS%% *}"

cleanup() {
  local c d
  for c in "${CONTAINERS[@]:-}"; do
    [ -n "$c" ] && docker stop "$c" >/dev/null 2>&1 || true
  done
  for d in "${TMPDIRS[@]:-}"; do
    [ -n "$d" ] || continue
    rm -rf "$d" 2>/dev/null || true
    if [ -e "$d" ]; then
      # 容器內的使用者建立的檔案，主機端使用者可能刪不掉：用同一個映像的拋棄式容器清空
      docker run --rm --entrypoint sh -v "$d:/data" "$IMAGE:${FIRST_VERSION}" -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null' >/dev/null 2>&1 || true
      rm -rf "$d" 2>/dev/null || echo "警告：暫存目錄 $d 沒有刪乾淨" >&2
    fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT TERM

worst=0
for v in $VERSIONS; do
  echo "== n8n $v" >&2
  data="$(mktemp -d)"; TMPDIRS+=("$data"); chmod 777 "$data"
  N8N_ENCRYPTION_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")"
  export N8N_ENCRYPTION_KEY
  name="ci-matrix-${RUN_ID}-${v//./-}"
  net_args=(-p 127.0.0.1::5678)
  [ "$OFFLINE" = 1 ] && net_args=(--network none)
  docker run -d --rm --name "$name" --cpus 1 --memory 1g \
    "${net_args[@]}" -v "$data:/home/node/.n8n" \
    -e N8N_ENCRYPTION_KEY -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_SECURE_COOKIE=false \
    "$IMAGE:$v" >/dev/null || die "容器 $name 起不來"
  CONTAINERS+=("$name")
  unset N8N_ENCRYPTION_KEY

  probe='fetch("http://127.0.0.1:%s/healthz",{signal:AbortSignal.timeout(3000)}).then(r=>console.log(r.status)).catch(()=>console.log(0))'
  if [ "$OFFLINE" = 1 ]; then
    port=5678
  else
    port=""
    for _ in $(seq 1 20); do
      port="$(docker port "$name" 5678/tcp 2>/dev/null | head -n 1 | sed 's/.*://')"
      [ -n "$port" ] && break
      sleep 0.5
    done
    [ -n "$port" ] || die "取不到 $name 的對外 port"
  fi

  ready=0
  for _ in $(seq 1 120); do
    docker ps -q --filter "name=^${name}$" | grep -q . || break
    if [ "$OFFLINE" = 1 ]; then
      code="$(docker exec "$name" node -e "$(printf "$probe" "$port")" 2>/dev/null || echo 0)"
    else
      code="$(node -e "$(printf "$probe" "$port")")"
    fi
    if [ "$code" = "200" ]; then ready=1; break; fi
    sleep 1
  done
  if [ "$ready" != "1" ]; then
    echo "--- $name 最後的日誌 ---" >&2
    docker logs --tail 10 "$name" >&2 2>&1 || true
    die "n8n $v 在時限內沒有就緒"
  fi

  extra=()
  [ -n "$WF_TIMEOUT" ] && extra=(--workflow-timeout "$WF_TIMEOUT")
  rc=0
  if [ "$OFFLINE" = 1 ]; then
    docker cp "$HERE" "$name:/tmp/ci-scripts" >/dev/null || die "docker cp 腳本失敗"
    docker cp "$DIR" "$name:/tmp/ci-wf" >/dev/null || die "docker cp workflow 目錄失敗"
    docker exec -e N8N_URL="http://127.0.0.1:${port}" "$name" node /tmp/ci-scripts/run-on-n8n.mjs --bootstrap --dir /tmp/ci-wf \
      --target-version "$v" --out /tmp/ci-report.json ${extra[@]+"${extra[@]}"} || rc=$?
    if [ "$rc" -le 1 ]; then
      docker cp "$name:/tmp/ci-report.json" "$OUT_DIR/ci-report-$v.json" >/dev/null || rc=2
    fi
  else
    N8N_URL="http://127.0.0.1:${port}" node "$HERE/run-on-n8n.mjs" --bootstrap --dir "$DIR" \
      --target-version "$v" --out "$OUT_DIR/ci-report-$v.json" ${extra[@]+"${extra[@]}"} || rc=$?
  fi
  if [ "$rc" -ge 2 ]; then
    rm -f "$OUT_DIR/ci-report-$v.json"
    worst=2
  elif [ "$rc" -eq 1 ] && [ "$worst" -lt 1 ]; then
    worst=1
  fi

  docker stop "$name" >/dev/null 2>&1 || true
  CONTAINERS=("${CONTAINERS[@]/$name}")
  rm -rf "$data" 2>/dev/null || true
done

node "$HERE/matrix-summary.mjs" --out-dir "$OUT_DIR" --versions "$VERSIONS"
exit "$worst"
