param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$InputDirectory = (Join-Path $PSScriptRoot 'artifacts/Tonarium-win-x64'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'artifacts/releases'),
    [string]$Commit
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$') { throw 'Version must be a semantic version without the v prefix' }
$inputRoot = (Resolve-Path -LiteralPath $InputDirectory).Path
foreach ($file in @('Tonarium.exe', 'Tonarium.dll', 'Unity/Tonarium3D.exe', 'Unity/UnityPlayer.dll', 'Unity/Tonarium3D_Data/globalgamemanagers')) {
    if (-not (Test-Path -LiteralPath (Join-Path $inputRoot $file) -PathType Leaf)) { throw "Incomplete Windows client: $file is missing" }
}
if (-not $Commit) { $Commit = (& git -C $PSScriptRoot rev-parse HEAD); if ($LASTEXITCODE -ne 0) { throw 'Cannot determine source commit' } }
$unityVersion = ((Get-Content (Join-Path $PSScriptRoot 'Tonarium.Unity/ProjectSettings/ProjectVersion.txt') | Select-String '^m_EditorVersion:').ToString() -split ':', 2)[1].Trim()
@{ version = $Version; commit = $Commit; runtime = 'win-x64'; unity = $unityVersion; builtAt = [DateTime]::UtcNow.ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $inputRoot 'release.json') -Encoding utf8
@'
Tonarium for Windows

ZIPをすべて展開し、Tonarium.exeを起動してください。
.NETとUnityのランタイムを同梱しています。Unityフォルダーを移動・削除しないでください。
このプロトタイプはコード署名されていません。
'@ | Set-Content -LiteralPath (Join-Path $inputRoot 'README.txt') -Encoding utf8
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$archive = Join-Path $OutputDirectory "Tonarium-v$Version-win-x64.zip"
Compress-Archive -LiteralPath $inputRoot -DestinationPath $archive -CompressionLevel Optimal -Force
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $([IO.Path]::GetFileName($archive))" | Set-Content -LiteralPath "$archive.sha256" -Encoding ascii
Write-Output $archive
