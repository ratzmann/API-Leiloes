# Gera trafego no usuarios-service para movimentar os graficos do Grafana.
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1 -BaseUrl https://usuarios-service-dev.onrender.com -Rodadas 10
#
# Fala direto com o servico (sem o Kong): cadastros, credito da saga e alguns erros de proposito.
param(
    [string]$BaseUrl = "http://localhost:3002",
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

# CPF com digitos verificadores validos (o servico recusa CPF invalido)
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

for ($i = 1; $i -le $Rodadas; $i++) {
    $sufixo = "$(Get-Random -Maximum 100000000)"

    # leiloeiro valido (201) e consulta
    $leiloeiro = Chamar POST "/leiloeiros" @{
        nome                 = "Leiloeiro $i"
        email                = "leiloeiro$sufixo@trafego.com"
        registroProfissional = "JUCESC-$(Get-Random -Minimum 100000 -Maximum 999999)"
    }
    if ($leiloeiro.ok) {
        Contar "leiloeiros"
        Chamar GET "/leiloeiros/$($leiloeiro.corpo.id)" | Out-Null
    }

    # licitante valido com credito
    $licitante = Chamar POST "/licitantes" @{
        nome          = "Licitante $i"
        email         = "licitante$sufixo@trafego.com"
        cpf           = Novo-Cpf
        limiteCredito = 10000
    }
    if ($licitante.ok) {
        Contar "licitantes"
        $id = $licitante.corpo.id
        # o credito e dado pessoal (LGPD): sem o token do proprio licitante -> 401
        Chamar GET "/licitantes/$id/credito" | Out-Null
        Contar "credito sem login 401"

        # saga: reserva, repete a mesma referencia (idempotente) e as vezes libera
        $reserva = Chamar POST "/licitantes/$id/reservas" @{ valor = 2500; referencia = "trafego-$sufixo" }
        if ($reserva.ok) {
            Contar "reservas"
            Chamar POST "/licitantes/$id/reservas" @{ valor = 2500; referencia = "trafego-$sufixo" } | Out-Null
            if ((Get-Random -Maximum 2) -eq 0) {
                Chamar POST "/licitantes/$id/reservas/$($reserva.corpo.id)/liberar" | Out-Null
                Contar "liberacoes"
            }
        }

        # credito insuficiente: 409
        Chamar POST "/licitantes/$id/reservas" @{ valor = 999999 } | Out-Null
        Contar "recusados 409"
    }

    # erros de proposito: 400 e 404
    Chamar POST "/licitantes" @{ nome = "x" } | Out-Null
    Contar "recusados 400"
    Chamar GET "/leiloeiros/999999999" | Out-Null
    Contar "nao encontrados 404"

    Chamar GET "/licitantes" | Out-Null
    Write-Host -NoNewline "."
}

Write-Host ""
$contagem.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0,-22} {1}" -f $_.Name, $_.Value }
