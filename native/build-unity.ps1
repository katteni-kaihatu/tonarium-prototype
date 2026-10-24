param([string]$UnityEditor, [string]$Version)
$ErrorActionPreference = 'Stop'
$nativeRoot = $PSScriptRoot
if (-not $UnityEditor) {
    $requiredVersion = ((Get-Content (Join-Path $nativeRoot 'Tonarium.Unity/ProjectSettings/ProjectVersion.txt') | Select-String '^m_EditorVersion:').ToString() -split ':', 2)[1].Trim()
    $editors = Get-ChildItem 'C:\Program Files\Unity\Hub\Editor' -Directory -ErrorAction SilentlyContinue
    $preferred = $editors | Where-Object Name -EQ $requiredVersion | Sort-Object Name -Descending | Select-Object -First 1
    if ($preferred) { $UnityEditor = Join-Path $preferred.FullName 'Editor\Unity.exe' }
}
if (-not $UnityEditor -or -not (Test-Path -LiteralPath $UnityEditor)) { throw 'Unity Editor が見つかりません。Unity Hub で Windows Build Support を含む Editor を導入するか -UnityEditor で指定してください。' }
$projectPath = Join-Path $nativeRoot 'Tonarium.Unity'
& node (Join-Path $projectPath 'Tools/sync-web-assets.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Web asset sync failed' }
$logPath = Join-Path $projectPath 'build.log'
$editorArgs = @('-batchmode','-nographics','-quit','-projectPath',('"' + $projectPath + '"'),'-executeMethod','Tonarium.UnityClient.Editor.WindowsBuild.Build','-logFile',('"' + $logPath + '"'))
if ($Version) { $editorArgs += @('-buildVersion', $Version) }
$process = Start-Process -FilePath $UnityEditor -ArgumentList $editorArgs -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -ne 0) { Get-Content -LiteralPath $logPath -Tail 60; throw "Unity build failed ($($process.ExitCode))" }
Write-Output (Join-Path $nativeRoot 'build\unity\Tonarium3D.exe')
