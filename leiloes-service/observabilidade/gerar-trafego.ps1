# Gera trafego no leiloes-service para movimentar os graficos do Grafana.
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1 -BaseUrl https://leiloes-service-dev.onrender.com -Rodadas 10
#
# Fala direto com o servico (sem o Kong). Funciona com o servico rodando sozinho
# (sem USUARIOS_SERVICE_URL), que nao valida o leiloeiro.
param(
    [string]$BaseUrl = "http://localhost:3003",
    [int]$Rodadas = 20
)

function Chamar($metodo, $rota, $corpo = $null) {
    $parametros = @{ Uri = "$BaseUrl$rota"; Method = $metodo; ContentType = "application/json" }
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
    $leilao = @{
        leiloeiroId      = Get-Random -Minimum 1 -Maximum 1000000
        titulo           = "Nelore - Lote $i"
        raca             = "Nelore"
        quantidadeBois   = Get-Random -Minimum 1 -Maximum 80
        lanceInicial     = 5000
        incrementoMinimo = 100
        dataInicio       = $agora.AddDays(1).ToString("o")
        dataFim          = $agora.AddDays(1).AddHours(2).ToString("o")
    }

    # cadastro valido (201) e consulta
    $criado = Chamar POST "/leiloes" $leilao
    if ($criado.ok) {
        Contar "cadastrados"
        $id = $criado.corpo.id
        Chamar GET "/leiloes/$id" | Out-Null
        Chamar GET "/leiloes/$id/disponibilidade" | Out-Null

        # mesmo leiloeiro no mesmo horario, com o leilao ainda ativo: 409 (Regra 4)
        Chamar POST "/leiloes" $leilao | Out-Null
        Contar "recusados 409"

        # ciclo de vida: metade abre e encerra, um quarto cancela
        $sorteio = Get-Random -Maximum 4
        if ($sorteio -le 1) {
            Chamar PATCH "/leiloes/$id/abrir" | Out-Null
            Chamar PATCH "/leiloes/$id/encerrar" | Out-Null
            Contar "abertos e encerrados"
        } elseif ($sorteio -eq 2) {
            Chamar PATCH "/leiloes/$id/cancelar" | Out-Null
            Contar "cancelados"
        }
    }

    # erros de proposito: 400 (Regra 1) e 404
    Chamar POST "/leiloes" @{ titulo = "x" } | Out-Null
    Contar "recusados 400"
    Chamar GET "/leiloes/999999999" | Out-Null
    Contar "nao encontrados 404"

    Chamar GET "/leiloes?status=AGENDADO" | Out-Null
    Write-Host -NoNewline "."
}

Write-Host ""
$contagem.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0,-22} {1}" -f $_.Name, $_.Value }
