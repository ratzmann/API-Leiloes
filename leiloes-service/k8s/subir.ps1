# Sobe o leiloes-service no Minikube (T3), do zero, e mostra as evidencias.
#   powershell -ExecutionPolicy Bypass -File .\leiloes-service\k8s\subir.ps1
#
# Passos: inicia o Minikube -> liga os addons ingress e metrics-server ->
# kubectl apply -k (todos os manifests) -> espera os Deployments -> lista os pods.
# Para acessar pelo navegador, depois rode "minikube tunnel" em outro terminal
# (ver k8s/README.md).
param(
    # memoria do Minikube em MB (o Docker Desktop precisa ter pelo menos isso livre)
    [int]$Memoria = 3000
)
$pasta = $PSScriptRoot
function Parar-SeFalhou($passo) {
    if ($LASTEXITCODE -ne 0) { Write-Host "Falhou: $passo" -ForegroundColor Red; exit 1 }
}

Write-Host "== Minikube" -ForegroundColor Cyan
minikube status | Out-Null
if ($LASTEXITCODE -ne 0) {
    minikube start --driver=docker --cpus=2 --memory=$Memoria
    Parar-SeFalhou 'minikube start'
}
minikube addons enable ingress
minikube addons enable metrics-server

Write-Host "== Aplicando os manifests de $pasta" -ForegroundColor Cyan
kubectl apply -k $pasta
Parar-SeFalhou 'kubectl apply'

Write-Host "== Esperando os Deployments ficarem prontos" -ForegroundColor Cyan
foreach ($d in 'leiloes-db', 'leiloes-service', 'prometheus', 'grafana') {
    kubectl -n leiloes rollout status "deployment/$d" --timeout=300s
}

Write-Host "== Evidencias" -ForegroundColor Cyan
kubectl -n leiloes get deployments,pods,services,ingress,hpa -o wide

Write-Host ""
Write-Host "Pronto. Para acessar, rode em OUTRO terminal (deixe aberto):  minikube tunnel" -ForegroundColor Green
Write-Host "e confira no arquivo hosts (C:\Windows\System32\drivers\etc\hosts):"
Write-Host "  127.0.0.1 leiloes.local grafana.leiloes.local prometheus.leiloes.local"
Write-Host "API:        http://leiloes.local/health   (Swagger em /docs)"
Write-Host "Grafana:    http://grafana.leiloes.local  (admin / admin)"
Write-Host "Prometheus: http://prometheus.leiloes.local/targets"
