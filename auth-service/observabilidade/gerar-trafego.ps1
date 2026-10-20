# Gera trafego no auth-service para movimentar os graficos do Grafana.
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1
#   powershell -ExecutionPolicy Bypass -File .\gerar-trafego.ps1 -BaseUrl https://auth-service-dev-rslq.onrender.com -Rodadas 10
#
# Fala direto com o servico (sem o Kong): registros, logins certos e errados.
# Funciona com o servico rodando sozinho (sem USUARIOS_SERVICE_URL): o perfil fica nulo.
param(
    [string]$BaseUrl = "http://localhost:3001",
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
    $email = "usuario$(Get-Random -Maximum 100000000)@trafego.com"
    $papel = @("LEILOEIRO", "LICITANTE")[(Get-Random -Maximum 2)]

    # registro valido (201)
    $registro = Chamar POST "/registrar" @{ nome = "Usuario $i"; email = $email; senha = "segredo123"; papel = $papel }
    if ($registro.ok) {
        Contar "registros"

        # mesmo e-mail de novo: 409
        Chamar POST "/registrar" @{ nome = "Usuario $i"; email = $email; senha = "segredo123"; papel = $papel } | Out-Null
        Contar "recusados 409"

        # login certo (200) e, as vezes, senha errada (401)
        Chamar POST "/login" @{ email = $email; senha = "segredo123" } | Out-Null
        Contar "logins ok"
        if ((Get-Random -Maximum 3) -eq 0) {
            Chamar POST "/login" @{ email = $email; senha = "senha-errada" } | Out-Null
            Contar "logins 401"
        }
    }

    # erro de proposito: 400
    Chamar POST "/registrar" @{ nome = "x" } | Out-Null
    Contar "recusados 400"

    Write-Host -NoNewline "."
}

Write-Host ""
$contagem.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0,-22} {1}" -f $_.Name, $_.Value }
