$ErrorActionPreference = "Stop"

# Downloads a known FFmpeg build for Windows and places `ffmpeg.exe` into:
# apps/desktop/src-tauri/bin/win64/ffmpeg.exe
#
# Source: BtbN FFmpeg-Builds (GPL/LGPL depends on artifact). Verify license before redistribution.

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "apps\desktop\src-tauri\bin\win64"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Choose one:
# - gpl: includes non-free codecs depending on build; check compliance
# - lgpl: safer for redistribution
$flavor = "lgpl"

if ($flavor -eq "lgpl") {
  $url = "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-lgpl.zip"
} else {
  $url = "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"
}

$tmp = Join-Path $env:TEMP ("vte-ffmpeg-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$zip = Join-Path $tmp "ffmpeg.zip"
Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $zip

Write-Host "Extracting..."
Expand-Archive -Path $zip -DestinationPath $tmp -Force

$ff = Get-ChildItem -Path $tmp -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $ff) {
  throw "ffmpeg.exe not found in archive"
}

Copy-Item -Force $ff.FullName (Join-Path $outDir "ffmpeg.exe")
Write-Host "Wrote: $(Join-Path $outDir 'ffmpeg.exe')"

