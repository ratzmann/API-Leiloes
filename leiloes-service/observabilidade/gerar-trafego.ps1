# Gera trafego no leiloes-service para movimentar os graficos do Grafana.
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1 -BaseUrl https://leiloes-service-dev-bnhz.onrender.com -Rodadas 10
#
# Fala direto com o servico (sem o Kong). Funciona com o servico rodando sozinho
# (sem USUARIOS_SERVICE_URL), que nao valida o leiloeiro. Tambem funciona pelo
# Kong (-BaseUrl http://localhost:8000), porque os tokens sao assinados.
#
# Autorizacao (revisao do T1): cadastrar e mudar o status de um leilao exige um
# token de LEILOEIRO, e o leilao fica em nome do perfilId do token. Cada rodada
# cria um token para um leiloeiro sorteado, assinado com o JWT_SECRET (o mesmo
# do auth-service e do kong.yml), porque o servico confere a assinatura
# (jwt.verify). No Render, passe o segredo daquele ambiente em -JwtSecret.
param(
    [string]$BaseUrl = "http://localhost:3003",
    [int]$Rodadas = 20,
    [string]$JwtSecret = "super-segredo-trabalho-microsservicos",
    [string]$JwtIssuer = "sistema-leilao-auth"
)

# Monta um JWT HS256 (cabecalho.carga.assinatura, em base64url) para um leiloeiro.
function Novo-Token($perfilId) {
    function B64Url([byte[]]$bytes) { [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
    $utf8 = [Text.Encoding]::UTF8
    $agora = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $carga = @{ sub = $perfilId; papel = 'LEILOEIRO'; perfilId = $perfilId; iss = $JwtIssuer; iat = $agora; exp = $agora + 3600 } |
        ConvertTo-Json -Compress
    $semAssinatura = (B64Url $utf8.GetBytes('{"alg":"HS256","typ":"JWT"}')) + '.' + (B64Url $utf8.GetBytes($carga))
    $hmac = New-Object System.Security.Cryptography.HMACSHA256 (, $utf8.GetBytes($JwtSecret))
    return $semAssinatura + '.' + (B64Url $hmac.ComputeHash($utf8.GetBytes($semAssinatura)))
}

function Chamar($metodo, $rota, $corpo = $null, $token = $null) {
    $parametros = @{ Uri = "$BaseUrl$rota"; Method = $metodo; ContentType = "application/json" }
    if ($token) { $parametros.Headers = @{ Authorization = "Bearer $token" } }
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

for ($i = 1; $i -le $Rodadas; $i++) {
    $agora = (Get-Date).ToUniversalTime()
    $perfilId = Get-Random -Minimum 1 -Maximum 1000000
    $token = Novo-Token $perfilId
    $leilao = @{
        leiloeiroId      = $perfilId
        titulo           = "Nelore - Lote $i"
        raca             = "Nelore"
        quantidadeBois   = Get-Random -Minimum 1 -Maximum 80
        lanceInicial     = 5000
        incrementoMinimo = 100
        dataInicio       = $agora.AddDays(1).ToString("o")
        dataFim          = $agora.AddDays(1).AddHours(2).ToString("o")
    }

    # cadastro valido (201) e consulta
    $criado = Chamar POST "/leiloes" $leilao $token
    if ($criado.ok) {
        Contar "cadastrados"
        $id = $criado.corpo.id
        Chamar GET "/leiloes/$id" $null $token | Out-Null
        Chamar GET "/leiloes/$id/disponibilidade" $null $token | Out-Null

        # mesmo leiloeiro no mesmo horario, com o leilao ainda ativo: 409 (Regra 4)
        Chamar POST "/leiloes" $leilao $token | Out-Null
        Contar "recusados 409"

        # ciclo de vida: metade abre e encerra, um quarto cancela
        $sorteio = Get-Random -Maximum 4
        if ($sorteio -le 1) {
            Chamar PATCH "/leiloes/$id/abrir" $null $token | Out-Null
            Chamar PATCH "/leiloes/$id/encerrar" $null $token | Out-Null
            Contar "abertos e encerrados"
        } elseif ($sorteio -eq 2) {
            Chamar PATCH "/leiloes/$id/cancelar" $null $token | Out-Null
            Contar "cancelados"
        }
    }

    # erros de proposito: 400 (Regra 1), 404 e cadastro sem token (401)
    Chamar POST "/leiloes" @{ titulo = "x" } $token | Out-Null
    Contar "recusados 400"
    Chamar GET "/leiloes/999999999" $null $token | Out-Null
    Contar "nao encontrados 404"
    Chamar POST "/leiloes" $leilao | Out-Null
    Contar "sem token 401"

    Chamar GET "/leiloes?status=AGENDADO" $null $token | Out-Null
    Write-Host -NoNewline "."
}

Write-Host ""
$contagem.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0,-22} {1}" -f $_.Name, $_.Value }
