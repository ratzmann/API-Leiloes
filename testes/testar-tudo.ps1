# ==============================================================================
# Script de Teste Automatizado de Ponta a Ponta (PowerShell)
# Sistema de Leilao de Bois - Kong API Gateway + Microsservicos
# ==============================================================================

$BaseUrl = "http://localhost:8000"
$script:TotalPass = 0
$script:TotalFail = 0
$script:token = ""

function Run-Step {
    param(
        [string]$Nome,
        [int]$CodigoEsperado,
        [scriptblock]$Acao
    )

    $nomeFormatado = "Testando: {0,-58} ... " -f $Nome
    Write-Host -NoNewline $nomeFormatado
    try {
        $resultado = & $Acao
        $statusRecebido = 200
        if ($resultado -and $resultado.StatusCode) {
            $statusRecebido = [int]$resultado.StatusCode
        }

        if ($statusRecebido -eq $CodigoEsperado) {
            Write-Host "[PASS] ($statusRecebido)" -ForegroundColor Green
            $script:TotalPass++
        } else {
            Write-Host "[FAIL] Esperava $CodigoEsperado, obteve $statusRecebido" -ForegroundColor Red
            $script:TotalFail++
        }
    } catch {
        $statusRecebido = 0
        if ($_.Exception.Response) {
            $statusRecebido = [int]$_.Exception.Response.StatusCode
        }
        if ($statusRecebido -eq $CodigoEsperado) {
            Write-Host "[PASS] ($statusRecebido)" -ForegroundColor Green
            $script:TotalPass++
        } else {
            Write-Host "[FAIL] Esperava $CodigoEsperado, obteve $statusRecebido" -ForegroundColor Red
            $script:TotalFail++
        }
    }
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "         INICIANDO TESTES DE INTEGRACAO NO GATEWAY (KONG :8000)          " -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

# 1. Healthcheck do auth
Run-Step -Nome "1. Healthcheck em /auth/health" -CodigoEsperado 200 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/auth/health" -Method Get -UseBasicParsing
    return @{ StatusCode = 200 }
}

# 2. Bloqueio sem token em /licitantes
Run-Step -Nome "2. Acesso sem token a /licitantes (espera 401)" -CodigoEsperado 401 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/licitantes" -Method Get -UseBasicParsing
}

# 3. Registrar Licitante
$licitanteEmail = "licitante_$(Get-Random)@example.com"
$bodyLicitante = @{
    nome = "Maria Souza"
    email = $licitanteEmail
    senha = "senha123"
    papel = "LICITANTE"
    dadosPerfil = @{
        cpf = "52998224725"
        limiteCredito = 5000
    }
} | ConvertTo-Json -Depth 5

Run-Step -Nome "3. Registrar licitante em /auth/registrar" -CodigoEsperado 201 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/auth/registrar" -Method Post -Body $bodyLicitante -ContentType "application/json"
    $script:token = $r.token
    return @{ StatusCode = 201 }
}

# 4. Login com sucesso
$bodyLogin = @{ email = $licitanteEmail; senha = "senha123" } | ConvertTo-Json
Run-Step -Nome "4. Login com senha correta em /auth/login" -CodigoEsperado 200 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/auth/login" -Method Post -Body $bodyLogin -ContentType "application/json" -UseBasicParsing
    return @{ StatusCode = 200 }
}

# 5. Login com senha errada
$bodyLoginErrado = @{ email = $licitanteEmail; senha = "errada" } | ConvertTo-Json
Run-Step -Nome "5. Login com senha errada (espera 401)" -CodigoEsperado 401 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/auth/login" -Method Post -Body $bodyLoginErrado -ContentType "application/json" -UseBasicParsing
}

# 6. Consultar /licitantes com Bearer Token
Run-Step -Nome "6. Consultar /licitantes com Bearer token" -CodigoEsperado 200 -Acao {
    $headers = @{ Authorization = "Bearer $($script:token)" }
    $null = Invoke-WebRequest -Uri "$BaseUrl/licitantes" -Headers $headers -Method Get -UseBasicParsing
    return @{ StatusCode = 200 }
}

# 7. Registrar Leiloeiro
$leiloeiroEmail = "leiloeiro_$(Get-Random)@example.com"
$regProf = "JUCESC-$(Get-Random -Minimum 100000 -Maximum 999999)"
$bodyLeiloeiro = @{
    nome = "Carlos Pereira"
    email = $leiloeiroEmail
    senha = "senha123"
    papel = "LEILOEIRO"
    dadosPerfil = @{
        registroProfissional = $regProf
        telefone = "47999998888"
    }
} | ConvertTo-Json -Depth 5

Run-Step -Nome "7. Registrar leiloeiro em /auth/registrar" -CodigoEsperado 201 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/auth/registrar" -Method Post -Body $bodyLeiloeiro -ContentType "application/json" -UseBasicParsing
    return @{ StatusCode = 201 }
}

# 8. Bloqueio sem token em /lances
Run-Step -Nome "8. Acesso sem token a /lances (espera 401)" -CodigoEsperado 401 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/lances" -Method Get -UseBasicParsing
}

# Gera leilaoId unico para cada execucao do script de teste ser 100% independente e repetivel
$leilaoId = Get-Random -Minimum 1000 -Maximum 999999

# 9. Submeter primeiro lance para o Leilao
$bodyLance1 = @{
    leilaoId = $leilaoId
    licitanteId = 1
    valor = 1000.00
} | ConvertTo-Json

Run-Step -Nome "9. Submeter primeiro lance de R$ 1000.00 (espera 201)" -CodigoEsperado 201 -Acao {
    $headers = @{ Authorization = "Bearer $($script:token)" }
    $null = Invoke-WebRequest -Uri "$BaseUrl/lances" -Headers $headers -Method Post -Body $bodyLance1 -ContentType "application/json" -UseBasicParsing
    return @{ StatusCode = 201 }
}

# 10. Regra de negocio: mesmo licitante cobrindo o proprio lance consecutivo
$bodyLanceMesmo = @{
    leilaoId = $leilaoId
    licitanteId = 1
    valor = 1200.00
} | ConvertTo-Json

Run-Step -Nome "10. Mesmo licitante cobrindo proprio lance (espera 400)" -CodigoEsperado 400 -Acao {
    $headers = @{ Authorization = "Bearer $($script:token)" }
    $null = Invoke-WebRequest -Uri "$BaseUrl/lances" -Headers $headers -Method Post -Body $bodyLanceMesmo -ContentType "application/json" -UseBasicParsing
}

# 11. Regra de negocio: outro licitante com valor menor ou igual
$bodyLanceMenor = @{
    leilaoId = $leilaoId
    licitanteId = 2
    valor = 950.00
} | ConvertTo-Json

Run-Step -Nome "11. Outro licitante com valor menor (espera 400)" -CodigoEsperado 400 -Acao {
    $headers = @{ Authorization = "Bearer $($script:token)" }
    $null = Invoke-WebRequest -Uri "$BaseUrl/lances" -Headers $headers -Method Post -Body $bodyLanceMenor -ContentType "application/json" -UseBasicParsing
}

# 12. Regra de negocio: outro licitante com valor superior
$bodyLanceMaior = @{
    leilaoId = $leilaoId
    licitanteId = 2
    valor = 1500.00
} | ConvertTo-Json

Run-Step -Nome "12. Outro licitante com valor superior R$ 1500.00 (espera 201)" -CodigoEsperado 201 -Acao {
    $headers = @{ Authorization = "Bearer $($script:token)" }
    $null = Invoke-WebRequest -Uri "$BaseUrl/lances" -Headers $headers -Method Post -Body $bodyLanceMaior -ContentType "application/json" -UseBasicParsing
    return @{ StatusCode = 201 }
}

# 13. Consultar maior lance do leilao
Run-Step -Nome "13. Consultar maior lance (/lances/leilao/$leilaoId/maior)" -CodigoEsperado 200 -Acao {
    $headers = @{ Authorization = "Bearer $($script:token)" }
    $null = Invoke-WebRequest -Uri "$BaseUrl/lances/leilao/$leilaoId/maior" -Headers $headers -Method Get -UseBasicParsing
    return @{ StatusCode = 200 }
}

# 14. Listar historico de lances do leilao
Run-Step -Nome "14. Listar historico de lances (/lances/leilao/$leilaoId)" -CodigoEsperado 200 -Acao {
    $headers = @{ Authorization = "Bearer $($script:token)" }
    $null = Invoke-WebRequest -Uri "$BaseUrl/lances/leilao/$leilaoId" -Headers $headers -Method Get -UseBasicParsing
    return @{ StatusCode = 200 }
}

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "                           RESUMO DOS TESTES                             " -ForegroundColor Yellow
Write-Host "   Passou: $script:TotalPass" -ForegroundColor Green
Write-Host "   Falhou: $script:TotalFail" -ForegroundColor $(if ($script:TotalFail -gt 0) { "Red" } else { "Green" })
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""
