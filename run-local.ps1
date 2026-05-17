# Script de inicializacao local via Node.js.
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-NodeBinary {
  param([Parameter(Mandatory = $true)][string]$Command)
  try {
    & $Command --version *> $null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Test-NpmBinary {
  param([Parameter(Mandatory = $true)][string]$Command)
  try {
    & $Command --version *> $null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

$nodeCandidates = @(
  "C:\\Program Files\\nodejs\\node.exe",
  "node"
)

$npmCandidates = @(
  "C:\\Program Files\\nodejs\\npm.cmd",
  "npm.cmd",
  "npm"
)

$nodeCmd = $null
foreach ($candidate in $nodeCandidates) {
  if (Test-NodeBinary -Command $candidate) {
    $nodeCmd = $candidate
    break
  }
}

if (-not $nodeCmd) {
  throw "Node.js nao encontrado. Instale Node 20+ e tente novamente."
}

$npmCmd = $null
foreach ($candidate in $npmCandidates) {
  if (Test-NpmBinary -Command $candidate) {
    $npmCmd = $candidate
    break
  }
}

if (-not $npmCmd) {
  throw "NPM nao encontrado. Verifique a instalacao do Node.js."
}

Write-Host "Usando Node: $nodeCmd" -ForegroundColor Cyan
Write-Host "Usando NPM: $npmCmd" -ForegroundColor Cyan

# Instala dependencias do projeto.
& $npmCmd install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao instalar dependencias do Node."
}

Write-Host "Iniciando servidor em http://127.0.0.1:8000" -ForegroundColor Green

# Sobe o backend Node.
& $nodeCmd (Join-Path $projectRoot "server.js")
