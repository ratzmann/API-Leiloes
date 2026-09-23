# ==============================================================================
# testar-unitarios.ps1  -  roda os testes unitarios (Jest) dos 4 microsservicos
# ------------------------------------------------------------------------------
# Uso (na raiz do projeto):
#     powershell -ExecutionPolicy Bypass -File .\testes\testar-unitarios.ps1
#
# Como roda:
#   - se o Node.js estiver instalado (comando npm), usa "npm test" em cada servico;
#   - senao, usa um container Docker com Node 20 (precisa do Docker aberto).
# Em cada servico o "npm test" roda o Jest com cobertura; o proprio Jest falha
# se a cobertura ficar abaixo de 50% (coverageThreshold no package.json).
#
# Diferente do testar-tudo.ps1, aqui NAO precisa subir o sistema: os testes
# unitarios trocam banco e outros servicos por mocks.
# ==============================================================================

$ErrorActionPreference = "Continue"
$raiz = Split-Path -Parent $PSScriptRoot
$servicos = @("auth-service", "usuarios-service", "leiloes-service", "lances-service")

# Decide o "motor": Node local ou Docker
$temNpm = [bool](Get-Command npm -ErrorAction SilentlyContinue)
$temDocker = [bool](Get-Command docker -ErrorAction SilentlyContinue)
if (-not $temNpm -and -not $temDocker) {
    Write-Host "Nem Node.js (npm) nem Docker encontrados. Instale um dos dois." -ForegroundColor Red
    exit 1
}
$modo = if ($temNpm) { "Node.js local" } else { "Docker (node:20-alpine)" }

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "           TESTES UNITARIOS DOS MICROSSERVICOS (Jest) - $modo" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

$resumo = @()
foreach ($svc in $servicos) {
    $pasta = Join-Path $raiz $svc
    Write-Host ""
    Write-Host "---> $svc" -ForegroundColor Yellow

    # text-summary = resumo curto da cobertura (Statements/Branches/Functions/Lines)
    $jest = "npx jest --coverage --coverageReporters=text-summary"
    if ($temNpm) {
        Push-Location $pasta
        if (-not (Test-Path "node_modules")) { npm install --silent 2>&1 | Out-Null }
        $saida = cmd /c "$jest 2>&1"
        $codigo = $LASTEXITCODE
        Pop-Location
    } else {
        # monta a pasta do servico dentro do container e roda la
        $saida = docker run --rm -v "${pasta}:/app" -w /app node:20-alpine `
            sh -c "[ -d node_modules ] || npm install --silent >/dev/null 2>&1; $jest 2>&1"
        $codigo = $LASTEXITCODE
    }

    # pega do texto do Jest as linhas que interessam
    $testes = ($saida | Select-String -Pattern "^Tests:" | Select-Object -Last 1)
    $linhas = ($saida | Select-String -Pattern "^Lines\s*:" | Select-Object -Last 1)
    $saida | Select-String -Pattern "^(Tests|Statements|Branches|Functions|Lines)\s*:|FAIL|threshold" |
        ForEach-Object { Write-Host "     $($_.Line)" }

    $resumo += [PSCustomObject]@{
        Servico   = $svc
        Resultado = if ($codigo -eq 0) { "OK" } else { "FALHOU" }
        Testes    = if ($testes) { ($testes.Line -replace "^Tests:\s*", "") } else { "-" }
        Linhas    = if ($linhas) { ($linhas.Line -replace "^Lines\s*:\s*", "") } else { "-" }
    }
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "                                 RESUMO                                   " -ForegroundColor Yellow
Write-Host "==========================================================================" -ForegroundColor Cyan
$resumo | Format-Table -AutoSize | Out-String | Write-Host

$falhas = @($resumo | Where-Object { $_.Resultado -ne "OK" }).Count
if ($falhas -gt 0) {
    Write-Host "   $falhas servico(s) com falha (teste quebrado ou cobertura abaixo de 50%)." -ForegroundColor Red
    exit 1
}
Write-Host "   Todos os servicos passaram (cobertura minima: 50%)." -ForegroundColor Green
exit 0
