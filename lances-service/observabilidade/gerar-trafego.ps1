# Gera trafego no lances-service para movimentar os graficos do Grafana.
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1 -Rodadas 10
#
# Diferente dos outros servicos, o lances-service nao funciona sozinho: a Saga
# precisa do leiloes-service e do usuarios-service. Por isso o script fala com o
# SISTEMA COMPLETO pelo Kong (suba antes, na raiz: docker compose up -d), como um
# usuario de verdade: registra leiloeiros e licitantes, cria e abre um leilao por
# rodada e da lances que passam por todos os caminhos da Saga.
# As falhas simuladas (X-Simular-Falha) exigem SAGA_PERMITIR_FALHA_SIMULADA=true,
# ja ligado no docker-compose.yml da raiz.
param(
    [string]$BaseUrl = "http://localhost:8000",
    [int]$Rodadas = 5
)

function Chamar($metodo, $rota, $corpo = $null, $token = $null, $extras = @{}) {
    $cabecalhos = @{}
    if ($token) { $cabecalhos.Authorization = "Bearer $token" }
    foreach ($chave in $extras.Keys) { $cabecalhos[$chave] = $extras[$chave] }
    $parametros = @{ Uri = "$BaseUrl$rota"; Method = $metodo; ContentType = "application/json"; Headers = $cabecalhos }
    if ($corpo) { $parametros.Body = ($corpo | ConvertTo-Json) }
    try {
        $resposta = Invoke-RestMethod @parametros
        return @{ ok = $true; corpo = $resposta }
    } catch {
        return @{ ok = $false; status = [int]$_.Exception.Response.StatusCode }
    }
}

$contagem = @{}
function Contar($nome) { $contagem[$nome] = 1 + [int]$contagem[$nome] }

# CPF com digitos verificadores validos (o usuarios-service recusa CPF invalido)
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

# Registra pelo auth-service (que cria o perfil no usuarios-service) e devolve
# { token, perfilId }; para o script se o sistema nao estiver no ar.
function Registrar($papel, $dadosPerfil) {
    $sufixo = Get-Random
    $r = Chamar POST "/auth/registrar" @{
        nome = "Trafego $papel $sufixo"; email = "trafego_$sufixo@lances.com"; senha = "senha123"
        papel = $papel; dadosPerfil = $dadosPerfil
    }
    if (-not $r.ok) { throw "Registro falhou (HTTP $($r.status)). O sistema esta no ar (docker compose up -d na raiz)?" }
    return @{ token = $r.corpo.token; perfilId = $r.corpo.perfil.id }
}

function Lance($token, $leilaoId, $valor, $falha = $null) {
    $extras = @{}
    if ($falha) { $extras["X-Simular-Falha"] = $falha }
    return Chamar POST "/lances" @{ leilaoId = $leilaoId; valor = $valor } $token $extras
}

# --- preparacao: licitantes (reaproveitados) e um leiloeiro + leilao por rodada ---
$maria = Registrar "LICITANTE" @{ cpf = (Novo-Cpf); limiteCredito = 1000000 }
$joao = Registrar "LICITANTE" @{ cpf = (Novo-Cpf); limiteCredito = 1000000 }
$pobre = Registrar "LICITANTE" @{ cpf = (Novo-Cpf); limiteCredito = 500 }

$leiloes = @()
$inicio = (Get-Date).ToUniversalTime().AddSeconds(15)
for ($i = 1; $i -le $Rodadas; $i++) {
    # um leiloeiro por leilao: o mesmo leiloeiro nao pode ter dois leiloes no mesmo horario
    $leiloeiro = Registrar "LEILOEIRO" @{ registroProfissional = "JUCESC-$(Get-Random -Minimum 100000 -Maximum 999999)" }
    $criado = Chamar POST "/leiloes" @{
        titulo = "Nelore - Lote $i"; quantidadeBois = 20; lanceInicial = 1000; incrementoMinimo = 100
        dataInicio = $inicio.ToString("o"); dataFim = $inicio.AddHours(1).ToString("o")
    } $leiloeiro.token
    if ($criado.ok) {
        Chamar PATCH "/leiloes/$($criado.corpo.id)/abrir" $null $leiloeiro.token | Out-Null
        $leiloes += @{ id = $criado.corpo.id; leiloeiro = $leiloeiro }
    }
}
Write-Host "$($leiloes.Count) leiloes abertos; esperando o horario de inicio..."
Start-Sleep -Seconds 17

# --- lances: cada rodada passa pelos caminhos da Saga ---
foreach ($leilao in $leiloes) {
    $id = $leilao.id

    if ((Lance $maria.token $id 1000).ok) { Contar "lance aceito (CONCLUIDA)" }
    Lance $joao.token $id 900 | Out-Null;  Contar "abaixo do lance inicial (400)"
    Lance $maria.token $id 1200 | Out-Null; Contar "cobrindo o proprio lance (400)"
    if ((Lance $joao.token $id 1100).ok) { Contar "lance superado (CONCLUIDA)" }
    Lance $pobre.token $id 5000 | Out-Null; Contar "credito insuficiente (409)"

    # compensacao: falha ao gravar o lance depois de reservar o credito
    Lance $maria.token $id 1300 "gravar-lance" | Out-Null
    Contar "compensada (500)"

    # pendencia no passo 4 e reprocessamento
    $pendente = Lance $maria.token $id 1300 "liberar-credito-superado"
    if ($pendente.ok) {
        Contar "pendencia (CONCLUIDA_COM_PENDENCIA)"
        Chamar POST "/lances/sagas/$($pendente.corpo.sagaId)/reprocessar" $null $maria.token | Out-Null
        Contar "reprocessada"
    }

    # consultas e erros de proposito
    Chamar GET "/lances/leilao/$id/maior" $null $maria.token | Out-Null
    Chamar GET "/lances/leilao/$id" $null $maria.token | Out-Null
    Lance $maria.token 999999999 1000 | Out-Null; Contar "leilao inexistente (404)"
    Lance $leilao.leiloeiro.token $id 5000 | Out-Null; Contar "leiloeiro dando lance (403)"

    # metade dos leiloes e cancelada: o credito reservado volta (Regra 8)
    if ((Get-Random -Maximum 2) -eq 0) {
        Chamar PATCH "/leiloes/$id/cancelar" $null $leilao.leiloeiro.token | Out-Null
        Contar "leiloes cancelados"
    }
    Write-Host -NoNewline "."
}

Write-Host ""
$contagem.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0,-38} {1}" -f $_.Name, $_.Value }
