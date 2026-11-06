# TigerAI Code2n8n Skill Pack 解除安裝（Windows PowerShell）
# 用法:
#   .\uninstall.ps1 [-Target claude|antigravity|all] [-DryRun] [-Help]

[CmdletBinding()]
param(
  [ValidateSet('claude','antigravity','all')]
  [string]$Target = 'all',
  [switch]$DryRun,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

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
$SharedDir = '_tigerai-pack-shared'

function Show-Usage {
  Write-Host @"
TigerAI Code2n8n Skill Pack uninstaller

Usage:
  .\uninstall.ps1 [-Target claude|antigravity|all] [-DryRun] [-Help]

Options:
  -Target <claude|antigravity|all>   Which environment(s) to clean. Default: all detected.
  -DryRun                            Print the actions but do not touch the filesystem.
  -Help                              Show this help.

Behaviour:
  * Removes the 29 skill folders (21 vendor + 8 TigerAI) and the
    _tigerai-pack-shared\ folder the installer dropped — nothing else.
  * Skill folders not present are silently skipped.
"@
}

if ($Help) { Show-Usage; exit 0 }

$ClaudeHome = if ($env:CLAUDE_HOME) { $env:CLAUDE_HOME } else { Join-Path $HOME '.claude' }
$AntigravityHome = Join-Path $HOME '.gemini\antigravity'

$ClaudeTarget = Join-Path $ClaudeHome 'skills'
$AntigravityTarget = Join-Path $AntigravityHome 'global_skills'

$Targets = @()
switch ($Target) {
  'claude'      { $Targets += $ClaudeTarget }
  'antigravity' { $Targets += $AntigravityTarget }
  'all' {
    if (Test-Path $ClaudeTarget) { $Targets += $ClaudeTarget }
    if (Test-Path $AntigravityTarget) { $Targets += $AntigravityTarget }
  }
}

if ($Targets.Count -eq 0) {
  Write-Host "ℹ Nothing to do — neither $ClaudeTarget nor $AntigravityTarget exists." -ForegroundColor Cyan
  exit 0
}

Write-Host "🧹 TigerAI Code2n8n Skill Pack — Uninstaller" -ForegroundColor Cyan
Write-Host "   Target:   $Target"
if ($DryRun) { Write-Host "   Mode:     DRY-RUN (no filesystem writes)" -ForegroundColor Yellow }
foreach ($T in $Targets) { Write-Host "   →         $T" }
Write-Host ""

function Remove-IfPresent {
  param([string]$Path)
  if (Test-Path $Path) {
    if ($DryRun) {
      Write-Host "   [dry-run] Remove-Item -Recurse -Force `"$Path`""
    } else {
      Remove-Item -Path $Path -Recurse -Force
    }
    Write-Host "   ✓ removed $(Split-Path -Leaf $Path)"
  }
}

foreach ($TargetDir in $Targets) {
  Write-Host "🧹 Cleaning: $TargetDir" -ForegroundColor Yellow
  foreach ($name in ($VendorSkills + $TigerAISkills)) {
    Remove-IfPresent (Join-Path $TargetDir $name)
  }
  Remove-IfPresent (Join-Path $TargetDir $SharedDir)
  Write-Host ""
}

Write-Host "✅ Uninstall complete." -ForegroundColor Green
if ($DryRun) { Write-Host "   (dry-run: nothing was actually removed.)" -ForegroundColor Yellow }
