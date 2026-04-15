$ErrorActionPreference = "Stop"

# Builds a standalone `transcriber.exe` using PyInstaller and places it into:
# apps/desktop/src-tauri/bin/win64/transcriber.exe
#
# Prereqs:
# - Python 3.10+
# - pip install -e services/transcriber
# - pip install pyinstaller

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$svc = Join-Path $root "services\transcriber"
$outDir = Join-Path $root "apps\desktop\src-tauri\bin\win64"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Push-Location $svc
try {
  py -3 -m pip install -U pyinstaller | Out-Null
  py -3 -m pip install -e . | Out-Null

  # Clean previous build artifacts
  if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
  if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }

  py -3 -m PyInstaller --noconfirm --onefile --name transcriber sidecar_entry.py

  $exe = Join-Path $svc "dist\transcriber.exe"
  if (-not (Test-Path $exe)) { throw "Expected output not found: $exe" }

  Copy-Item -Force $exe (Join-Path $outDir "transcriber.exe")
  Write-Host "Wrote: $(Join-Path $outDir 'transcriber.exe')"
}
finally {
  Pop-Location
}

