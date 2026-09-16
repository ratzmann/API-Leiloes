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

# ------------------------------------------------------------------------------
# Leiloes (leiloes-service): cadastro, regras de negocio e ciclo de vida
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "--------------------------- LEILOES (leiloes-service) --------------------" -ForegroundColor Cyan

$script:tokenLeiloeiro = ""
$script:leiloeiroId = 0
$script:leilaoCriadoId = 0
$script:leilaoRemovivelId = 0

# Datas sempre no futuro para o script ser repetivel (UTC, formato ISO 8601)
$amanha = (Get-Date).ToUniversalTime().Date.AddDays(1)
$inicio = $amanha.AddHours(14).ToString("yyyy-MM-ddTHH:mm:ssZ")
$fim = $amanha.AddHours(17).ToString("yyyy-MM-ddTHH:mm:ssZ")
$fimCurto = $amanha.AddHours(14).AddMinutes(10).ToString("yyyy-MM-ddTHH:mm:ssZ")
$inicioOutroDia = $amanha.AddDays(2).AddHours(9).ToString("yyyy-MM-ddTHH:mm:ssZ")
$fimOutroDia = $amanha.AddDays(2).AddHours(12).ToString("yyyy-MM-ddTHH:mm:ssZ")

function Novo-Leilao {
    param([int]$LeiloeiroId, [string]$Titulo, [double]$LanceInicial, [double]$Incremento, [string]$Inicio, [string]$Fim)
    return @{
        leiloeiroId = $LeiloeiroId
        titulo = $Titulo
        descricao = "Bois nelore terminados a pasto, media de 18 arrobas."
        localEvento = "Parque de Exposicoes de Lages"
        raca = "Nelore"
        quantidadeBois = 40
        lanceInicial = $LanceInicial
        incrementoMinimo = $Incremento
        dataInicio = $Inicio
        dataFim = $Fim
    } | ConvertTo-Json
}

# 15. Bloqueio sem token em /leiloes
Run-Step -Nome "15. Acesso sem token a /leiloes (espera 401)" -CodigoEsperado 401 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Method Get -UseBasicParsing
}

# 16. Login do leiloeiro registrado no passo 7 (token + id do perfil de leiloeiro)
$bodyLoginLeiloeiro = @{ email = $leiloeiroEmail; senha = "senha123" } | ConvertTo-Json
Run-Step -Nome "16. Login do leiloeiro (token e perfil_id)" -CodigoEsperado 200 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method Post -Body $bodyLoginLeiloeiro -ContentType "application/json"
    $script:tokenLeiloeiro = $r.token
    $script:leiloeiroId = [int]$r.usuario.perfil_id
    if (-not $script:tokenLeiloeiro -or $script:leiloeiroId -le 0) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

$headersLeiloeiro = @{ Authorization = "Bearer $($script:tokenLeiloeiro)" }

# 17. Cadastro valido
Run-Step -Nome "17. Cadastrar leilao valido (espera 201, AGENDADO)" -CodigoEsperado 201 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao de Nelore - Lote 12" -LanceInicial 5000 -Incremento 100 -Inicio $inicio -Fim $fim
    $r = Invoke-RestMethod -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json"
    $script:leilaoCriadoId = [int]$r.id
    if ($r.status -ne "AGENDADO") { return @{ StatusCode = 500 } }
    return @{ StatusCode = 201 }
}

# 18. Regra: leiloeiro precisa existir no usuarios-service
Run-Step -Nome "18. Leiloeiro inexistente (espera 404)" -CodigoEsperado 404 -Acao {
    $body = Novo-Leilao -LeiloeiroId 999999 -Titulo "Leilao sem dono" -LanceInicial 1000 -Incremento 50 -Inicio $inicio -Fim $fim
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 19. Regra: data de inicio no futuro
Run-Step -Nome "19. Data de inicio no passado (espera 400)" -CodigoEsperado 400 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao no passado" -LanceInicial 1000 -Incremento 50 -Inicio "2020-01-01T10:00:00Z" -Fim "2020-01-01T14:00:00Z"
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 20. Regra: incremento nao pode ser maior que o lance inicial
Run-Step -Nome "20. Incremento maior que lance inicial (espera 400)" -CodigoEsperado 400 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Incremento absurdo" -LanceInicial 100 -Incremento 500 -Inicio $inicio -Fim $fim
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 21. Regra: duracao minima de 30 minutos
Run-Step -Nome "21. Leilao com menos de 30 minutos (espera 400)" -CodigoEsperado 400 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao relampago" -LanceInicial 1000 -Incremento 50 -Inicio $inicio -Fim $fimCurto
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 22. Regra: leiloeiro nao conduz dois leiloes no mesmo periodo
Run-Step -Nome "22. Mesmo leiloeiro, mesmo horario (espera 409)" -CodigoEsperado 409 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao concorrente" -LanceInicial 2000 -Incremento 50 -Inicio $inicio -Fim $fim
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 23. Consultar por id
Run-Step -Nome "23. Consultar leilao por id (espera 200)" -CodigoEsperado 200 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)" -Headers $headersLeiloeiro -Method Get -UseBasicParsing
    return @{ StatusCode = 200 }
}

# 24. Consultar id inexistente
Run-Step -Nome "24. Consultar leilao inexistente (espera 404)" -CodigoEsperado 404 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/999999" -Headers $headersLeiloeiro -Method Get -UseBasicParsing
}

# 25. Listar com filtros
Run-Step -Nome "25. Listar leiloes AGENDADOS do leiloeiro (espera 200)" -CodigoEsperado 200 -Acao {
    $lista = Invoke-RestMethod -Uri "$BaseUrl/leiloes?status=AGENDADO&leiloeiroId=$($script:leiloeiroId)" -Headers $headersLeiloeiro -Method Get
    if (@($lista | Where-Object { $_.id -eq $script:leilaoCriadoId }).Count -ne 1) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 26. Editar enquanto AGENDADO
Run-Step -Nome "26. Editar leilao AGENDADO (espera 200)" -CodigoEsperado 200 -Acao {
    $body = @{ quantidadeBois = 45 } | ConvertTo-Json
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)" -Headers $headersLeiloeiro -Method Put -Body $body -ContentType "application/json" -UseBasicParsing
    return @{ StatusCode = 200 }
}

# 27. Regra do ciclo de vida: status inexistente
Run-Step -Nome "27. Alterar para status inexistente (espera 400)" -CodigoEsperado 400 -Acao {
    $body = @{ status = "LEILOADO" } | ConvertTo-Json
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/status" -Headers $headersLeiloeiro -Method Patch -Body $body -ContentType "application/json" -UseBasicParsing
}

# 28. Regra do ciclo de vida: nao encerra sem abrir
Run-Step -Nome "28. Encerrar sem ter aberto (espera 409)" -CodigoEsperado 409 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/encerrar" -Headers $headersLeiloeiro -Method Patch -UseBasicParsing
}

# 29. Abrir o pregao
Run-Step -Nome "29. Abrir o pregao (espera 200, ABERTO)" -CodigoEsperado 200 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/abrir" -Headers $headersLeiloeiro -Method Patch
    if ($r.status -ne "ABERTO") { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 30. Regra: nao edita depois de aberto
Run-Step -Nome "30. Editar leilao ja ABERTO (espera 409)" -CodigoEsperado 409 -Acao {
    $body = @{ titulo = "Nao deveria passar" } | ConvertTo-Json
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)" -Headers $headersLeiloeiro -Method Put -Body $body -ContentType "application/json" -UseBasicParsing
}

# 31. Ponto de integracao consultado pelo lances-service
Run-Step -Nome "31. Consultar disponibilidade para lances (espera 200)" -CodigoEsperado 200 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/disponibilidade" -Headers $headersLeiloeiro -Method Get
    # Aberto, mas o periodo so comeca amanha: ainda nao aceita lances
    if ($r.status -ne "ABERTO" -or $r.aceitandoLances -ne $false) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 32. Encerrar
Run-Step -Nome "32. Encerrar o pregao (espera 200, ENCERRADO)" -CodigoEsperado 200 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/encerrar" -Headers $headersLeiloeiro -Method Patch
    if ($r.status -ne "ENCERRADO") { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 33. Regra: ENCERRADO e estado final
Run-Step -Nome "33. Cancelar leilao ja ENCERRADO (espera 409)" -CodigoEsperado 409 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/cancelar" -Headers $headersLeiloeiro -Method Patch -UseBasicParsing
}

# 34. Regra: so remove leilao AGENDADO
Run-Step -Nome "34. Remover leilao ENCERRADO (espera 409)" -CodigoEsperado 409 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)" -Headers $headersLeiloeiro -Method Delete -UseBasicParsing
}

# 35. Remover um leilao ainda AGENDADO (outro periodo, sem conflito de agenda)
Run-Step -Nome "35. Cadastrar e remover leilao AGENDADO (espera 204)" -CodigoEsperado 204 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao para remover" -LanceInicial 3000 -Incremento 100 -Inicio $inicioOutroDia -Fim $fimOutroDia
    $criado = Invoke-RestMethod -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json"
    $script:leilaoRemovivelId = [int]$criado.id
    $r = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoRemovivelId)" -Headers $headersLeiloeiro -Method Delete -UseBasicParsing
    return @{ StatusCode = [int]$r.StatusCode }
}

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "                           RESUMO DOS TESTES                             " -ForegroundColor Yellow
Write-Host "   Passou: $script:TotalPass" -ForegroundColor Green
Write-Host "   Falhou: $script:TotalFail" -ForegroundColor $(if ($script:TotalFail -gt 0) { "Red" } else { "Green" })
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""
