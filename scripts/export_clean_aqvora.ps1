<#
.SYNOPSIS
  Export the complete currently checked-out AQVORA source to a fresh local folder
  WITHOUT old Git commit history, remote, PR refs or old GitHub Actions workflows.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\export_clean_aqvora.ps1 -Destination "C:\Dev\AQVORA"
#>
[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $env:USERPROFILE "AQVORA-FRESH")
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$source = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$destinationFull = [System.IO.Path]::GetFullPath($Destination)
if ($destinationFull -eq $source -or $destinationFull.StartsWith($source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Destination must NOT be inside the existing clone; select an independent folder outside OneDrive."
}
if (Test-Path -LiteralPath $destinationFull) {
  throw "Destination already exists. Choose an empty NEW folder; no files were overwritten: $destinationFull"
}
$tracked = & git -C $source rev-parse --is-inside-work-tree
if ($LASTEXITCODE -ne 0 -or $tracked.Trim() -ne "true") {
  throw "Run this script from the AQVORA export Git working tree."
}
$branch = & git -C $source branch --show-current
$head = & git -C $source rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Cannot read current Git head." }
Write-Host "Exporting source snapshot $head from $branch"

$zip = Join-Path $env:TEMP ("aqvora-source-" + [guid]::NewGuid().ToString("N") + ".zip")
try {
  & git -C $source archive --format=zip "--output=$zip" HEAD
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $zip)) {
    throw "Git archive failed; nothing was exported."
  }
  Expand-Archive -LiteralPath $zip -DestinationPath $destinationFull -Force

  # The new product gets its own GitHub workflows and deployment setup.
  # Remove old Actions configs to avoid accidental backup/production jobs.
  $legacyGitHubConfig = Join-Path $destinationFull ".github"
  if (Test-Path -LiteralPath $legacyGitHubConfig) {
    Remove-Item -LiteralPath $legacyGitHubConfig -Recurse -Force
  }
  foreach ($artifact in @(".git", ".vercel", "node_modules", "dist")) {
    if (Test-Path -LiteralPath (Join-Path $destinationFull $artifact)) {
      throw "Unexpected legacy artifact found in source export: $artifact"
    }
  }
  foreach ($secretName in @(".env", ".env.local", ".env.production", ".env.production.local", ".env.development.local")) {
    if (Test-Path -LiteralPath (Join-Path $destinationFull $secretName)) {
      throw "Unexpected environment secret file in clean export: $secretName"
    }
  }

  $trackedFiles = @(Get-ChildItem -LiteralPath $destinationFull -Recurse -File -Force)
  if (-not (Test-Path -LiteralPath (Join-Path $destinationFull "package.json")) -or
      -not (Test-Path -LiteralPath (Join-Path $destinationFull "supabase\migrations")) -or
      -not (Test-Path -LiteralPath (Join-Path $destinationFull "AQVORA_CLEAN_START.md"))) {
    throw "Source verification failed. Check incomplete archive and do not publish."
  }
  Write-Host ""
  Write-Host "AQVORA CLEAN SOURCE EXPORTED SUCCESSFULLY" -ForegroundColor Green
  Write-Host "Destination: $destinationFull"
  Write-Host "Source files: $($trackedFiles.Count)"
  Write-Host "No inherited .git, no old GitHub workflows, no old Vercel project link."
  Write-Host ""
  Write-Host "NEXT: Put founder reference images in references/, then:"
  Write-Host "  cd `"$destinationFull`""
  Write-Host "  npm ci"
  Write-Host "  npm run dev"
  Write-Host ""
  Write-Host "Create a brand-new Git repo ONLY AFTER reviewing source and environment:"
  Write-Host "  git init -b main"
  Write-Host "  git add ."
  Write-Host "  git commit -m `"chore: start independent AQVORA source`""
  Write-Host "Connect only your NEW GitHub remote. DO NOT use git push --mirror."
} finally {
  if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
  }
}
