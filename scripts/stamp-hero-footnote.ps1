# Stamps the compact platform-ownership footnote onto the known-good v15
# hero base images. This script intentionally does NOT use docs/images as
# input, because those files may already be stamped or may be generated from
# an older logo version.
#
# Source-of-truth rules: docs/hero-image-assets.md
#
# Usage:
#   pwsh scripts/stamp-hero-footnote.ps1

param(
  [switch]$English,
  [switch]$Chinese,
  [switch]$Promote
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$pendingDir = Join-Path $repoRoot 'artifacts\imagegen\pending'
$docsImageDir = Join-Path $repoRoot 'docs\images'

if (-not $English -and -not $Chinese) {
  $English = $true
  $Chinese = $true
}

function Stamp-Footnote {
  param(
    [string]$InputPath,
    [string]$OutputPath,
    [string]$Line1,
    [string]$Line2,
    [string]$FontFamily
  )

  $bmp = [System.Drawing.Bitmap]::FromFile($InputPath)
  try {
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

      # Replace only the old explanatory line inside the bottom banner.
      # Keep the corrected logos, main slogan, red border, and layout untouched.
      $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
      $g.FillRectangle($white, 320, 878, 1080, 36)

      $navy = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(7, 24, 72))
      $font = [System.Drawing.Font]::new($FontFamily, 17, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
      $fmt = [System.Drawing.StringFormat]::new()
      $fmt.Alignment = [System.Drawing.StringAlignment]::Center
      $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

      $rect1 = [System.Drawing.RectangleF]::new(245, 881, 1182, 16)
      $rect2 = [System.Drawing.RectangleF]::new(245, 899, 1182, 16)
      $g.DrawString($Line1, $font, $navy, $rect1, $fmt)
      $g.DrawString($Line2, $font, $navy, $rect2, $fmt)
    }
    finally {
      $g.Dispose()
    }

    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $bmp.Dispose()
  }

  $img = [System.Drawing.Image]::FromFile($OutputPath)
  try {
    Write-Host ("Wrote {0} ({1}x{2})" -f $OutputPath, $img.Width, $img.Height)
  }
  finally {
    $img.Dispose()
  }
}

function Join-CodePoints {
  param([int[]]$CodePoints)
  return -join ($CodePoints | ForEach-Object { [string][char]$_ })
}

if ($English) {
  $enBase = Join-Path $pendingDir 'code2n8n-hero-en-v15-correct-vector-logos.png'
  $enOut = Join-Path $pendingDir 'code2n8n-hero-en-v19-correct-logos-platform-footnote.png'
  Stamp-Footnote `
    -InputPath $enBase `
    -OutputPath $enOut `
    -Line1 'Platform capabilities (SSO/IAM, Audit Log, HA, Metrics, Source Control) are provided by n8n editions + enterprise IT.' `
    -Line2 'This Pack provides migration, review, validation, and governance methods.' `
    -FontFamily 'Arial'

  if ($Promote) {
    Copy-Item -LiteralPath $enOut -Destination (Join-Path $docsImageDir 'code2n8n-hero-en.png') -Force
    Write-Host 'Promoted English hero to docs/images/code2n8n-hero-en.png'
  }
}

if ($Chinese) {
  $zhBase = Join-Path $pendingDir 'code2n8n-hero-zh-v15-correct-vector-logos.png'
  $zhOut = Join-Path $pendingDir 'code2n8n-hero-zh-v19-correct-logos-platform-footnote.png'
  $zhLine1 =
    (Join-CodePoints @(0x5E73,0x53F0,0x80FD,0x529B,0xFF08)) +
    'SSO/IAM' +
    (Join-CodePoints @(0x3001,0x7A3D,0x6838,0x65E5,0x8A8C,0x3001)) +
    'HA' +
    (Join-CodePoints @(0x3001)) +
    'Metrics' +
    (Join-CodePoints @(0x3001)) +
    'Source Control' +
    (Join-CodePoints @(0xFF09,0x7531,0x0020)) +
    'n8n' +
    (Join-CodePoints @(0x0020,0x7248,0x672C,0x8207,0x4F01,0x696D,0x0020)) +
    'IT' +
    (Join-CodePoints @(0x0020,0x63D0,0x4F9B,0x3002))
  $zhLine2 =
    (Join-CodePoints @(0x672C,0x0020)) +
    'Pack' +
    (Join-CodePoints @(0x0020,0x63D0,0x4F9B,0x79FB,0x690D,0x3001,0x5BE9,0x67E5,0x3001,0x9A57,0x8B49,0x8207,0x6CBB,0x7406,0x65B9,0x6CD5,0x3002))
  Stamp-Footnote `
    -InputPath $zhBase `
    -OutputPath $zhOut `
    -Line1 $zhLine1 `
    -Line2 $zhLine2 `
    -FontFamily 'Microsoft JhengHei'

  if ($Promote) {
    Copy-Item -LiteralPath $zhOut -Destination (Join-Path $docsImageDir 'code2n8n-hero-zh.png') -Force
    Write-Host 'Promoted Chinese hero to docs/images/code2n8n-hero-zh.png'
  }
}
