# TigerAI Code2n8n Skill Pack 一鍵安裝（Windows PowerShell）
# 用法:
#   .\install.ps1 [-Target claude|antigravity|all] [-DryRun] [-Help]

[CmdletBinding()]
param(
  [ValidateSet('claude','antigravity','all')]
  [string]$Target = 'all',
  [switch]$DryRun,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

# ---- Skill manifest (kept in sync with plugin.json) ----
$VendorSkills = @(
  'n8n-expression-syntax',
  'n8n-workflow-patterns',
  'n8n-validation-expert',
  'n8n-node-configuration',
  'n8n-code-javascript',
  'n8n-code-python',
  'n8n-agents-official',
  'n8n-ai-nodes-official',
  'n8n-binary-and-data-official',
  'n8n-code-nodes-official',
  'n8n-credentials-and-security-official',
  'n8n-data-tables-official',
  'n8n-debugging-official',
  'n8n-error-handling-official',
  'n8n-expressions-official',
  'n8n-extending-mcp-official',
  'n8n-loops-official',
  'n8n-node-configuration-official',
  'n8n-subworkflows-official',
  'n8n-workflow-lifecycle-official',
  'using-n8n-skills-official'
)
$TigerAISkills = @(
  'sticky-note-to-workflow',
  'n8n-api-bridge',
  'tigerai-enterprise-patterns',
  'tigerai-qa-mode',
  'tigerai-example-finder',
  'code-to-workflow',
  'n8n-security-governance',
  'n8n-code-to-native'
)
$ExpectedCount = $VendorSkills.Count + $TigerAISkills.Count   # 29 (21 vendor + 8 TigerAI)

function Show-Usage {
  Write-Host @"
TigerAI Code2n8n Skill Pack installer

Usage:
  .\install.ps1 [-Target claude|antigravity|all] [-DryRun] [-Help]

Options:
  -Target <claude|antigravity|all>   Which environment(s) to install into. Default: all detected.
  -DryRun                            Print the actions but do not touch the filesystem.
  -Help                              Show this help.

Behaviour:
  * Default ("all") installs into every environment whose parent dir already exists:
      - Claude Code:  `$env:CLAUDE_HOME\skills  (defaults to `$HOME\.claude\skills)
      - Antigravity:  `$HOME\.gemini\antigravity\global_skills
  * If neither parent dir exists, falls back to Claude.
  * "-Target claude" or "-Target antigravity" forces a single target.
  * Re-running is safe: existing skill folders are removed and recopied.
  * Post-install verifies all $ExpectedCount skill folders landed in each target.
"@
}

if ($Help) { Show-Usage; exit 0 }

$PackDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ClaudeHome = if ($env:CLAUDE_HOME) { $env:CLAUDE_HOME } else { Join-Path $HOME '.claude' }
$AntigravityHome = Join-Path $HOME '.gemini\antigravity'

$ClaudeTarget = Join-Path $ClaudeHome 'skills'
$AntigravityTarget = Join-Path $AntigravityHome 'global_skills'

$Targets = @()
switch ($Target) {
  'claude'      { $Targets += $ClaudeTarget }
  'antigravity' { $Targets += $AntigravityTarget }
  'all' {
    if (Test-Path $ClaudeHome) { $Targets += $ClaudeTarget }
    if (Test-Path $AntigravityHome) { $Targets += $AntigravityTarget }
    if ($Targets.Count -eq 0) { $Targets += $ClaudeTarget }
  }
}

Write-Host "📦 TigerAI Code2n8n Skill Pack — Installer" -ForegroundColor Cyan
Write-Host "   Source:   $PackDir"
Write-Host "   Target:   $Target"
if ($DryRun) { Write-Host "   Mode:     DRY-RUN (no filesystem writes)" -ForegroundColor Yellow }
foreach ($T in $Targets) { Write-Host "   →         $T" }
Write-Host ""

function Invoke-Step {
  param([string]$Description, [scriptblock]$Action)
  if ($DryRun) {
    Write-Host "   [dry-run] $Description"
  } else {
    & $Action
  }
}

function Copy-Skill {
  param([string]$SourceRoot, [string[]]$Names, [string]$TargetDir, [string]$Label)
  Write-Host "→ $Label ($($Names.Count))"
  foreach ($name in $Names) {
    $src = Join-Path $SourceRoot $name
    $dst = Join-Path $TargetDir $name
    if (-not (Test-Path $src)) { Write-Host "   ⚠ source missing: $src" -ForegroundColor Yellow; continue }
    Invoke-Step "remove $dst" { if (Test-Path $dst) { Remove-Item $dst -Recurse -Force } }
    Invoke-Step "copy $src -> $dst" { Copy-Item -Path $src -Destination $dst -Recurse }
    Write-Host "   ✓ $name"
  }
}

foreach ($TargetDir in $Targets) {
  Write-Host "🚀 Installing to: $TargetDir" -ForegroundColor Yellow
  Invoke-Step "ensure $TargetDir" { if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null } }

  Copy-Skill -SourceRoot (Join-Path $PackDir 'skills\_vendor') -Names $VendorSkills -TargetDir $TargetDir -Label 'Vendor skills'
  Copy-Skill -SourceRoot (Join-Path $PackDir 'skills\tigerai')  -Names $TigerAISkills -TargetDir $TargetDir -Label 'TigerAI skills'

  $Shared = Join-Path $TargetDir '_tigerai-pack-shared'
  Invoke-Step "reset $Shared" {
    if (Test-Path $Shared) { Remove-Item $Shared -Recurse -Force }
    New-Item -ItemType Directory -Path $Shared -Force | Out-Null
  }
  foreach ($sub in @('spec', 'cookbook', 'research', '02-USAGE-MODES.md', '03-FIRST-WORKFLOW.md', '04-FAQ.md')) {
    $src = Join-Path $PackDir $sub
    if (Test-Path $src) {
      Invoke-Step "copy $sub -> shared" { Copy-Item -Path $src -Destination $Shared -Recurse }
      Write-Host "   ✓ shared/$sub"
    }
  }

  if (-not $DryRun) {
    $installed = 0
    foreach ($name in ($VendorSkills + $TigerAISkills)) {
      if (Test-Path (Join-Path $TargetDir $name)) { $installed++ }
    }
    if ($installed -eq $ExpectedCount) {
      Write-Host "   ✅ Verify: $installed/$ExpectedCount skills present in $TargetDir" -ForegroundColor Green
    } else {
      Write-Host "   ❌ Verify: only $installed/$ExpectedCount skills present in $TargetDir" -ForegroundColor Red
      exit 1
    }
  }
  Write-Host ""
}

Write-Host "✅ Installation complete." -ForegroundColor Green
if ($DryRun) { Write-Host "   (dry-run: nothing was actually written.)" -ForegroundColor Yellow }

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Set n8n connection env vars:"
Write-Host '       $env:N8N_API_URL = "https://your-n8n.example.com"'
Write-Host '       $env:N8N_API_KEY = "<your-api-key>"'
Write-Host '  2. Smoke test:  curl -H "X-N8N-API-KEY: $env:N8N_API_KEY" "$env:N8N_API_URL/api/v1/workflows?limit=1"'
Write-Host "  3. 在 Claude Code 或 Antigravity 中試問：『我要建一個 webhook 收 GitHub event 通知 Slack』"
Write-Host "  4. To remove later:  .\uninstall.ps1 [-Target ...] [-DryRun]"
