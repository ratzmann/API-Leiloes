# ==============================================================================
# Script de Teste Automatizado de Ponta a Ponta (PowerShell)
# Sistema de Leilao de Bois - Kong API Gateway + Microsservicos + Saga
# ==============================================================================

$BaseUrl = "http://localhost:8000"
$script:TotalPass = 0
$script:TotalFail = 0

function Run-Step {
    param(
        [string]$Nome,
        [int]$CodigoEsperado,
        [scriptblock]$Acao
    )

    $nomeFormatado = "Testando: {0,-62} ... " -f $Nome
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

# igual ao Invoke-RestMethod, mas le o corpo tambem quando da erro (precisa do sagaId)
function Invoke-Api {
    param([string]$Metodo, [string]$Rota, $Corpo = $null, [string]$Token = "", [hashtable]$Extras = @{})

    $headers = @{}
    if ($Token) { $headers.Authorization = "Bearer $Token" }
    foreach ($k in $Extras.Keys) { $headers[$k] = $Extras[$k] }

    $params = @{ Uri = "$BaseUrl$Rota"; Method = $Metodo; Headers = $headers; UseBasicParsing = $true }
    if ($null -ne $Corpo) {
        $params.Body = ($Corpo | ConvertTo-Json -Depth 6)
        $params.ContentType = "application/json"
    }

    try {
        $r = Invoke-WebRequest @params
        $json = $null
        if ($r.Content) { $json = $r.Content | ConvertFrom-Json }
        return @{ StatusCode = [int]$r.StatusCode; Json = $json }
    } catch {
        $status = 0
        $json = $null
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            try {
                # o PowerShell ja le o corpo do erro no ErrorDetails; o stream so e o plano B
                $texto = $null
                if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                    $texto = $_.ErrorDetails.Message
                } else {
                    $stream = $_.Exception.Response.GetResponseStream()
                    if ($stream.CanSeek) { $stream.Position = 0 }
                    $texto = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
                }
                if ($texto) { $json = $texto | ConvertFrom-Json }
            } catch { }
        }
        return @{ StatusCode = $status; Json = $json }
    }
}

# gera um CPF valido e novo a cada execucao (o usuarios-service nao aceita repetido)
function Novo-Cpf {
    $d = @(1..9 | ForEach-Object { Get-Random -Minimum 0 -Maximum 10 })
    foreach ($n in 9, 10) {
        $soma = 0
        for ($i = 0; $i -lt $n; $i++) { $soma += $d[$i] * ($n + 1 - $i) }
        $dv = ($soma * 10) % 11
        if ($dv -eq 10) { $dv = 0 }
        $d += $dv
    }
    return ($d -join "")
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "         INICIANDO TESTES DE INTEGRACAO NO GATEWAY (KONG :8000)          " -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# Autenticacao e usuarios (auth-service + usuarios-service)
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "---------------------- AUTENTICACAO E USUARIOS --------------------------" -ForegroundColor Cyan

$script:token = ""
$script:licitanteAId = 0
$script:licitanteBId = 0

# 1. Healthcheck do auth
Run-Step -Nome "1. Healthcheck em /auth/health" -CodigoEsperado 200 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/auth/health" -Method Get -UseBasicParsing
    return @{ StatusCode = 200 }
}

# 2. Bloqueio sem token em /licitantes
Run-Step -Nome "2. Acesso sem token a /licitantes (espera 401)" -CodigoEsperado 401 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/licitantes" -Method Get -UseBasicParsing
}

# 3. Registrar Licitante A (auth-service cria o perfil no usuarios-service)
$licitanteEmail = "licitante_$(Get-Random)@example.com"
$bodyLicitante = @{
    nome = "Maria Souza"
    email = $licitanteEmail
    senha = "senha123"
    papel = "LICITANTE"
    dadosPerfil = @{
        cpf = (Novo-Cpf)
        limiteCredito = 5000
    }
} | ConvertTo-Json -Depth 5

Run-Step -Nome "3. Registrar licitante A (limite R$ 5000) com perfil criado" -CodigoEsperado 201 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/auth/registrar" -Method Post -Body $bodyLicitante -ContentType "application/json"
    $script:token = $r.token
    # sem perfil = o auth nao conseguiu falar com o usuarios-service
    if (-not $r.perfil -or -not $r.perfil.id) { return @{ StatusCode = 500 } }
    $script:licitanteAId = [int]$r.perfil.id
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

# 8. Registrar Licitante B (limite menor, para testar credito insuficiente)
$bodyLicitanteB = @{
    nome = "Joao Lima"
    email = "licitante_b_$(Get-Random)@example.com"
    senha = "senha123"
    papel = "LICITANTE"
    dadosPerfil = @{
        cpf = (Novo-Cpf)
        limiteCredito = 3000
    }
} | ConvertTo-Json -Depth 5

Run-Step -Nome "8. Registrar licitante B (limite R$ 3000) com perfil criado" -CodigoEsperado 201 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/auth/registrar" -Method Post -Body $bodyLicitanteB -ContentType "application/json"
    if (-not $r.perfil -or -not $r.perfil.id) { return @{ StatusCode = 500 } }
    $script:licitanteBId = [int]$r.perfil.id
    return @{ StatusCode = 201 }
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

# datas sempre no futuro, pra poder rodar o script varias vezes
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

# 9. Bloqueio sem token em /leiloes
Run-Step -Nome "9. Acesso sem token a /leiloes (espera 401)" -CodigoEsperado 401 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Method Get -UseBasicParsing
}

# 10. Login do leiloeiro registrado no passo 7 (token + id do perfil de leiloeiro)
$bodyLoginLeiloeiro = @{ email = $leiloeiroEmail; senha = "senha123" } | ConvertTo-Json
Run-Step -Nome "10. Login do leiloeiro (token e perfil_id)" -CodigoEsperado 200 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method Post -Body $bodyLoginLeiloeiro -ContentType "application/json"
    $script:tokenLeiloeiro = $r.token
    $script:leiloeiroId = [int]$r.usuario.perfil_id
    if (-not $script:tokenLeiloeiro -or $script:leiloeiroId -le 0) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

$headersLeiloeiro = @{ Authorization = "Bearer $($script:tokenLeiloeiro)" }

# 11. Cadastro valido
Run-Step -Nome "11. Cadastrar leilao valido (espera 201, AGENDADO)" -CodigoEsperado 201 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao de Nelore - Lote 12" -LanceInicial 5000 -Incremento 100 -Inicio $inicio -Fim $fim
    $r = Invoke-RestMethod -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json"
    $script:leilaoCriadoId = [int]$r.id
    if ($r.status -ne "AGENDADO") { return @{ StatusCode = 500 } }
    return @{ StatusCode = 201 }
}

# 12. Regra: leiloeiro precisa existir no usuarios-service
Run-Step -Nome "12. Leiloeiro inexistente (espera 404)" -CodigoEsperado 404 -Acao {
    $body = Novo-Leilao -LeiloeiroId 999999 -Titulo "Leilao sem dono" -LanceInicial 1000 -Incremento 50 -Inicio $inicio -Fim $fim
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 13. Regra: data de inicio no futuro
Run-Step -Nome "13. Data de inicio no passado (espera 400)" -CodigoEsperado 400 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao no passado" -LanceInicial 1000 -Incremento 50 -Inicio "2020-01-01T10:00:00Z" -Fim "2020-01-01T14:00:00Z"
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 14. Regra: incremento nao pode ser maior que o lance inicial
Run-Step -Nome "14. Incremento maior que lance inicial (espera 400)" -CodigoEsperado 400 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Incremento absurdo" -LanceInicial 100 -Incremento 500 -Inicio $inicio -Fim $fim
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 15. Regra: duracao minima de 30 minutos
Run-Step -Nome "15. Leilao com menos de 30 minutos (espera 400)" -CodigoEsperado 400 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao relampago" -LanceInicial 1000 -Incremento 50 -Inicio $inicio -Fim $fimCurto
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 16. Regra: leiloeiro nao conduz dois leiloes no mesmo periodo
Run-Step -Nome "16. Mesmo leiloeiro, mesmo horario (espera 409)" -CodigoEsperado 409 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao concorrente" -LanceInicial 2000 -Incremento 50 -Inicio $inicio -Fim $fim
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
}

# 17. Consultar por id
Run-Step -Nome "17. Consultar leilao por id (espera 200)" -CodigoEsperado 200 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)" -Headers $headersLeiloeiro -Method Get -UseBasicParsing
    return @{ StatusCode = 200 }
}

# 18. Consultar id inexistente
Run-Step -Nome "18. Consultar leilao inexistente (espera 404)" -CodigoEsperado 404 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/999999" -Headers $headersLeiloeiro -Method Get -UseBasicParsing
}

# 19. Listar com filtros
Run-Step -Nome "19. Listar leiloes AGENDADOS do leiloeiro (espera 200)" -CodigoEsperado 200 -Acao {
    $lista = Invoke-RestMethod -Uri "$BaseUrl/leiloes?status=AGENDADO&leiloeiroId=$($script:leiloeiroId)" -Headers $headersLeiloeiro -Method Get
    if (@($lista | Where-Object { $_.id -eq $script:leilaoCriadoId }).Count -ne 1) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 20. Editar enquanto AGENDADO
Run-Step -Nome "20. Editar leilao AGENDADO (espera 200)" -CodigoEsperado 200 -Acao {
    $body = @{ quantidadeBois = 45 } | ConvertTo-Json
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)" -Headers $headersLeiloeiro -Method Put -Body $body -ContentType "application/json" -UseBasicParsing
    return @{ StatusCode = 200 }
}

# 21. Regra do ciclo de vida: status inexistente
Run-Step -Nome "21. Alterar para status inexistente (espera 400)" -CodigoEsperado 400 -Acao {
    $body = @{ status = "LEILOADO" } | ConvertTo-Json
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/status" -Headers $headersLeiloeiro -Method Patch -Body $body -ContentType "application/json" -UseBasicParsing
}

# 22. Regra do ciclo de vida: nao encerra sem abrir
Run-Step -Nome "22. Encerrar sem ter aberto (espera 409)" -CodigoEsperado 409 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/encerrar" -Headers $headersLeiloeiro -Method Patch -UseBasicParsing
}

# 23. Abrir o pregao
Run-Step -Nome "23. Abrir o pregao (espera 200, ABERTO)" -CodigoEsperado 200 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/abrir" -Headers $headersLeiloeiro -Method Patch
    if ($r.status -ne "ABERTO") { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 24. Regra: nao edita depois de aberto
Run-Step -Nome "24. Editar leilao ja ABERTO (espera 409)" -CodigoEsperado 409 -Acao {
    $body = @{ titulo = "Nao deveria passar" } | ConvertTo-Json
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)" -Headers $headersLeiloeiro -Method Put -Body $body -ContentType "application/json" -UseBasicParsing
}

# 25. Ponto de integracao consultado pelo lances-service (passo 1 da Saga)
Run-Step -Nome "25. Consultar disponibilidade para lances (espera 200)" -CodigoEsperado 200 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/disponibilidade" -Headers $headersLeiloeiro -Method Get
    # Aberto, mas o periodo so comeca amanha: ainda nao aceita lances
    if ($r.status -ne "ABERTO" -or $r.aceitandoLances -ne $false) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 26. Encerrar
Run-Step -Nome "26. Encerrar o pregao (espera 200, ENCERRADO)" -CodigoEsperado 200 -Acao {
    $r = Invoke-RestMethod -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/encerrar" -Headers $headersLeiloeiro -Method Patch
    if ($r.status -ne "ENCERRADO") { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 27. Regra: ENCERRADO e estado final
Run-Step -Nome "27. Cancelar leilao ja ENCERRADO (espera 409)" -CodigoEsperado 409 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)/cancelar" -Headers $headersLeiloeiro -Method Patch -UseBasicParsing
}

# 28. Regra: so remove leilao AGENDADO
Run-Step -Nome "28. Remover leilao ENCERRADO (espera 409)" -CodigoEsperado 409 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoCriadoId)" -Headers $headersLeiloeiro -Method Delete -UseBasicParsing
}

# 29. Remover um leilao ainda AGENDADO (outro periodo, sem conflito de agenda)
Run-Step -Nome "29. Cadastrar e remover leilao AGENDADO (espera 204)" -CodigoEsperado 204 -Acao {
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao para remover" -LanceInicial 3000 -Incremento 100 -Inicio $inicioOutroDia -Fim $fimOutroDia
    $criado = Invoke-RestMethod -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json"
    $script:leilaoRemovivelId = [int]$criado.id
    $r = Invoke-WebRequest -Uri "$BaseUrl/leiloes/$($script:leilaoRemovivelId)" -Headers $headersLeiloeiro -Method Delete -UseBasicParsing
    return @{ StatusCode = [int]$r.StatusCode }
}

# ------------------------------------------------------------------------------
# Lances + Saga orquestrada (lances-service -> leiloes-service / usuarios-service)
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "---------------------- LANCES + SAGA (lances-service) --------------------" -ForegroundColor Cyan

$T = $script:tokenLeiloeiro
$script:leilaoAoVivoId = 0
$script:dataInicioAoVivo = $null
$script:sagaCompensadaId = 0
$script:sagaPendenteId = 0

function Credito-Reservado([int]$LicitanteId) {
    $r = Invoke-Api GET "/licitantes/$LicitanteId/credito" -Token $T
    if ($r.StatusCode -ne 200) { return -1 }
    return [double]$r.Json.reservado
}

function Lance([int]$LicitanteId, [double]$Valor, [int]$LeilaoId = $script:leilaoAoVivoId, [string]$Falha = "") {
    $extras = @{}
    if ($Falha) { $extras["X-Simular-Falha"] = $Falha }
    return Invoke-Api POST "/lances" @{ leilaoId = $LeilaoId; licitanteId = $LicitanteId; valor = $Valor } -Token $T -Extras $extras
}

# 30. Bloqueio sem token em /lances
Run-Step -Nome "30. Acesso sem token a /lances (espera 401)" -CodigoEsperado 401 -Acao {
    $null = Invoke-WebRequest -Uri "$BaseUrl/lances" -Method Get -UseBasicParsing
}

# 31. Leilao "ao vivo": comeca em poucos segundos, para receber lances no teste
Run-Step -Nome "31. Cadastrar e abrir leilao que comeca em 15s (espera 200)" -CodigoEsperado 200 -Acao {
    $agora = (Get-Date).ToUniversalTime()
    $body = Novo-Leilao -LeiloeiroId $script:leiloeiroId -Titulo "Leilao ao vivo - Saga" -LanceInicial 1000 -Incremento 100 `
        -Inicio $agora.AddSeconds(15).ToString("yyyy-MM-ddTHH:mm:ss.fffZ") -Fim $agora.AddHours(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $criado = Invoke-RestMethod -Uri "$BaseUrl/leiloes" -Headers $headersLeiloeiro -Method Post -Body $body -ContentType "application/json"
    $script:leilaoAoVivoId = [int]$criado.id
    $script:dataInicioAoVivo = [DateTime]::Parse($criado.data_inicio).ToUniversalTime()
    $r = Invoke-RestMethod -Uri "$BaseUrl/leiloes/$($script:leilaoAoVivoId)/abrir" -Headers $headersLeiloeiro -Method Patch
    if ($r.status -ne "ABERTO") { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 32. Saga passo 1: leilao aberto mas antes do horario de inicio
Run-Step -Nome "32. Saga: lance antes do inicio do pregao (espera 409)" -CodigoEsperado 409 -Acao {
    return (Lance $script:licitanteAId 1000)
}

# 33. Aguarda o horario de inicio e confirma que o leilao aceita lances
$espera = [Math]::Ceiling(($script:dataInicioAoVivo - (Get-Date).ToUniversalTime()).TotalSeconds) + 2
if ($espera -gt 0) {
    Write-Host "          (aguardando $espera s ate o inicio do pregao...)" -ForegroundColor DarkGray
    Start-Sleep -Seconds $espera
}
Run-Step -Nome "33. Disponibilidade: pregao aceitando lances (espera 200)" -CodigoEsperado 200 -Acao {
    $r = Invoke-Api GET "/leiloes/$($script:leilaoAoVivoId)/disponibilidade" -Token $T
    if ($r.StatusCode -ne 200 -or $r.Json.aceitandoLances -ne $true) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 34. Saga passo 1: leilao inexistente
Run-Step -Nome "34. Saga: lance em leilao inexistente (espera 404)" -CodigoEsperado 404 -Acao {
    return (Lance $script:licitanteAId 1000 -LeilaoId 99999999)
}

# 35. Saga passo 1: leilao encerrado
Run-Step -Nome "35. Saga: lance em leilao ENCERRADO (espera 409)" -CodigoEsperado 409 -Acao {
    return (Lance $script:licitanteAId 6000 -LeilaoId $script:leilaoCriadoId)
}

# 36. Regra: primeiro lance precisa ser de pelo menos o lance inicial
Run-Step -Nome "36. Saga: primeiro lance abaixo do lance inicial (espera 400)" -CodigoEsperado 400 -Acao {
    return (Lance $script:licitanteAId 900)
}

# 37. Saga passo 2: licitante inexistente no usuarios-service
Run-Step -Nome "37. Saga: licitante inexistente (espera 404)" -CodigoEsperado 404 -Acao {
    return (Lance 99999999 1000)
}

# 38. Saga passo 2: credito insuficiente (B tem R$ 3000)
Run-Step -Nome "38. Saga: credito insuficiente, B oferta R$ 3500 (espera 409)" -CodigoEsperado 409 -Acao {
    $r = Lance $script:licitanteBId 3500
    if ((Credito-Reservado $script:licitanteBId) -ne 0) { return @{ StatusCode = 500 } }
    return $r
}

# 39. Caminho feliz: primeiro lance
Run-Step -Nome "39. Saga: A oferta R$ 1000, saga CONCLUIDA (espera 201)" -CodigoEsperado 201 -Acao {
    $r = Lance $script:licitanteAId 1000
    if ($r.StatusCode -eq 201 -and $r.Json.sagaStatus -ne "CONCLUIDA") { return @{ StatusCode = 500 } }
    return $r
}

# 40. Passo 2 reservou o credito de A
Run-Step -Nome "40. Credito de A: R$ 1000 reservados (espera 200)" -CodigoEsperado 200 -Acao {
    if ((Credito-Reservado $script:licitanteAId) -ne 1000) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 41. Regra: licitante nao cobre o proprio lance
Run-Step -Nome "41. Saga: A cobre o proprio lance (espera 400)" -CodigoEsperado 400 -Acao {
    return (Lance $script:licitanteAId 1200)
}

# 42. Regra: incremento minimo
Run-Step -Nome "42. Saga: B oferta R$ 1050, abaixo do incremento (espera 400)" -CodigoEsperado 400 -Acao {
    return (Lance $script:licitanteBId 1050)
}

# 43. B supera A
Run-Step -Nome "43. Saga: B oferta R$ 1500 e supera A (espera 201)" -CodigoEsperado 201 -Acao {
    $r = Lance $script:licitanteBId 1500
    if ($r.StatusCode -eq 201 -and $r.Json.sagaStatus -ne "CONCLUIDA") { return @{ StatusCode = 500 } }
    return $r
}

# 44. Passo 4 liberou o credito de quem foi superado
Run-Step -Nome "44. Saga passo 4: credito de A liberado, B com R$ 1500 (espera 200)" -CodigoEsperado 200 -Acao {
    if ((Credito-Reservado $script:licitanteAId) -ne 0) { return @{ StatusCode = 500 } }
    if ((Credito-Reservado $script:licitanteBId) -ne 1500) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 45. Compensacao: falha ao gravar o lance depois de reservar o credito
Run-Step -Nome "45. Saga: falha simulada ao gravar lance de A (espera 500)" -CodigoEsperado 500 -Acao {
    $r = Lance $script:licitanteAId 2000 -Falha "gravar-lance"
    $script:sagaCompensadaId = [int]$r.Json.sagaId
    return $r
}

# 46. A saga registrou a compensacao
Run-Step -Nome "46. Saga COMPENSADA, reserva de A desfeita (espera 200)" -CodigoEsperado 200 -Acao {
    $s = Invoke-Api GET "/lances/sagas/$($script:sagaCompensadaId)" -Token $T
    $compensou = @($s.Json.passos | Where-Object { $_.passo -eq "reservar-credito" -and $_.resultado -eq "COMPENSADO" }).Count -eq 1
    if ($s.Json.status -ne "COMPENSADA" -or -not $compensou) { return @{ StatusCode = 500 } }
    if ((Credito-Reservado $script:licitanteAId) -ne 0) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 47. Passo repetivel: falha ao liberar o credito do superado nao desfaz o lance
Run-Step -Nome "47. Saga: falha simulada ao liberar credito de B (espera 201)" -CodigoEsperado 201 -Acao {
    $r = Lance $script:licitanteAId 2000 -Falha "liberar-credito-superado"
    $script:sagaPendenteId = [int]$r.Json.sagaId
    if ($r.StatusCode -eq 201 -and $r.Json.sagaStatus -ne "CONCLUIDA_COM_PENDENCIA") { return @{ StatusCode = 500 } }
    return $r
}

# 48. Pendencia: B continua com o credito preso
Run-Step -Nome "48. Pendencia: B ainda com R$ 1500 reservados (espera 200)" -CodigoEsperado 200 -Acao {
    if ((Credito-Reservado $script:licitanteBId) -ne 1500) { return @{ StatusCode = 500 } }
    return @{ StatusCode = 200 }
}

# 49. Reprocessar a pendencia
Run-Step -Nome "49. Reprocessar saga pendente (espera 200, CONCLUIDA)" -CodigoEsperado 200 -Acao {
    $r = Invoke-Api POST "/lances/sagas/$($script:sagaPendenteId)/reprocessar" -Token $T
    if ($r.StatusCode -eq 200 -and $r.Json.status -ne "CONCLUIDA") { return @{ StatusCode = 500 } }
    if ((Credito-Reservado $script:licitanteBId) -ne 0) { return @{ StatusCode = 500 } }
    return $r
}

# 50. Estado final do leilao
Run-Step -Nome "50. Maior lance: R$ 2000 de A (espera 200)" -CodigoEsperado 200 -Acao {
    $r = Invoke-Api GET "/lances/leilao/$($script:leilaoAoVivoId)/maior" -Token $T
    if ([double]$r.Json.valor -ne 2000 -or [int]$r.Json.licitante_id -ne $script:licitanteAId) { return @{ StatusCode = 500 } }
    return $r
}

# 51. Historico: so os 3 lances aceitos (as sagas que falharam nao gravaram lance)
Run-Step -Nome "51. Historico do leilao com 3 lances (espera 200)" -CodigoEsperado 200 -Acao {
    $r = Invoke-Api GET "/lances/leilao/$($script:leilaoAoVivoId)" -Token $T
    if (@($r.Json).Count -ne 3) { return @{ StatusCode = 500 } }
    return $r
}

# 52. Reservas de credito sao internas: o Kong bloqueia o acesso externo
Run-Step -Nome "52. Reserva de credito direto pelo Kong (espera 403)" -CodigoEsperado 403 -Acao {
    return (Invoke-Api POST "/licitantes/$($script:licitanteAId)/reservas" @{ valor = 10 } -Token $T)
}

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "                           RESUMO DOS TESTES                             " -ForegroundColor Yellow
Write-Host "   Passou: $script:TotalPass" -ForegroundColor Green
Write-Host "   Falhou: $script:TotalFail" -ForegroundColor $(if ($script:TotalFail -gt 0) { "Red" } else { "Green" })
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""
