param(
  [switch]$Prepare,
  [switch]$Stop,
  [ValidateRange(1024, 65535)][int]$Port = 18081,
  [ValidateRange(1, 2)][int]$Parallel = 2,
  [ValidateRange(1, 16)][int]$Threads = 6
)

$ErrorActionPreference = 'Stop'
if ($Prepare -and $Stop) { throw 'Choose either -Prepare or -Stop.' }
$npcWorkspace = Split-Path -Parent $PSScriptRoot
$npcRoot = Join-Path $npcWorkspace 'work\local-ai'
$npcRuntimeName = 'llama-b11856-bin-win-cpu-x64.zip'
$npcArchive = Join-Path $npcRoot $npcRuntimeName
$npcRuntimeDirectory = Join-Path $npcRoot 'llama-b11856'
$npcExecutable = Join-Path $npcRuntimeDirectory 'llama-server.exe'
$npcPidFile = Join-Path $npcRoot 'server.pid'
$npcModel = Join-Path $npcRoot 'Qwen3-1.7B-Q8_0.gguf'
$npcRuntimeHash = 'b0be608ec81c811029406430796dfcd16b8d83dc152705a6682f0d47834a2f3b'
$npcModelHash = '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a'
$npcModelRevision = '90862c4b9d2787eaed51d12237eafdfe7c5f6077'

function Assert-NpcHash([string]$File, [string]$Expected) {
  if ((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected) {
    throw "SHA256 mismatch: $File. No downloaded executable will be launched."
  }
}

if ($Stop) {
  if (-not (Test-Path -LiteralPath $npcPidFile)) { Write-Output 'No local NPC runtime PID was recorded.'; return }
  $npcRecordedId = [int](Get-Content -LiteralPath $npcPidFile -Raw)
  $npcRecorded = Get-Process -Id $npcRecordedId -ErrorAction SilentlyContinue
  if (-not $npcRecorded) { Write-Output 'The recorded local NPC runtime is already stopped.'; return }
  if ($npcRecorded.Path -ne $npcExecutable) { throw 'PID belongs to another executable. No process was stopped.' }
  Stop-Process -Id $npcRecordedId
  Write-Output "Stopped local NPC runtime PID $npcRecordedId."
  return
}

if ($Prepare) {
  New-Item -ItemType Directory -Path $npcRoot -Force | Out-Null
  $ProgressPreference = 'SilentlyContinue'
  if (-not (Test-Path -LiteralPath $npcArchive)) {
    Write-Output 'Downloading official llama.cpp Windows CPU runtime (24 MB)...'
    Invoke-WebRequest -Uri "https://github.com/ggml-org/llama.cpp/releases/download/b11856/$npcRuntimeName" -OutFile $npcArchive
  }
  Assert-NpcHash $npcArchive $npcRuntimeHash
  if (-not (Test-Path -LiteralPath $npcExecutable)) {
    Expand-Archive -LiteralPath $npcArchive -DestinationPath $npcRuntimeDirectory
  }
  if (-not (Test-Path -LiteralPath $npcModel)) {
    Write-Output 'Downloading official Qwen3-1.7B Q8_0 model (1.83 GB)...'
    Invoke-WebRequest -Uri "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/$npcModelRevision/Qwen3-1.7B-Q8_0.gguf?download=true" -OutFile $npcModel
  }
}
if (-not (Test-Path -LiteralPath $npcExecutable) -or -not (Test-Path -LiteralPath $npcModel)) {
  throw 'Local runtime or model is missing. Run this script once with -Prepare to download the official files.'
}
Assert-NpcHash $npcModel $npcModelHash
Assert-NpcHash $npcExecutable '1f34b3e7b8b9b77c2fbfbe90d2c70110d9118d8f08c852e8214ee1410ab4d027'
if (Test-Path -LiteralPath $npcPidFile) {
  $npcPreviousId = [int](Get-Content -LiteralPath $npcPidFile -Raw)
  $npcPrevious = Get-Process -Id $npcPreviousId -ErrorAction SilentlyContinue
  if ($npcPrevious -and $npcPrevious.Path -eq $npcExecutable) {
    throw 'The recorded NPC runtime is already running. Use -Stop before starting another model.'
  }
}
$npcQuotedModel = '"' + $npcModel + '"'
$npcContext = 4096 * $Parallel
$npcChild = Start-Process -FilePath $npcExecutable -ArgumentList @(
  '-m', $npcQuotedModel, '--host', '127.0.0.1', '--port', "$Port",
  '--ctx-size', "$npcContext", '--threads', "$Threads", '--threads-batch', "$Threads",
  '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0', '--flash-attn', 'on',
  '--n-predict', '256', '--parallel', "$Parallel", '--jinja', '--reasoning', 'off',
  '--alias', 'qwen3-1.7b', '--no-ui', '--cors-origins', 'localhost'
) -WorkingDirectory $npcRoot -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $npcRoot 'server.stdout.log') `
  -RedirectStandardError (Join-Path $npcRoot 'server.stderr.log')
$npcChild.Id | Set-Content -LiteralPath $npcPidFile
$npcDeadline = [DateTime]::UtcNow.AddSeconds(25)
while ([DateTime]::UtcNow -lt $npcDeadline) {
  if ($npcChild.HasExited) {
    Get-Content -LiteralPath (Join-Path $npcRoot 'server.stderr.log') -Tail 15
    throw 'The local NPC runtime exited during startup.'
  }
  try {
    $npcHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    if ($npcHealth.status -eq 'ok') {
      [PSCustomObject]@{ PID = $npcChild.Id; BaseUrl = "http://127.0.0.1:$Port/v1"; Model = 'qwen3-1.7b'; Parallel = $Parallel; ContextPerSlot = 4096; KvCache = 'q8_0'; Threads = $Threads } | ConvertTo-Json
      return
    }
  } catch {}
  Start-Sleep -Milliseconds 250
}
throw 'The local NPC runtime did not become ready within 25 seconds. Check work/local-ai/server.stderr.log.'
