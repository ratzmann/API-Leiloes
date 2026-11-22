# Sobe o auth-service no Minikube (T3), do zero, e mostra as evidencias.
#   powershell -ExecutionPolicy Bypass -File .\auth-service\k8s\subir.ps1
#   powershell -ExecutionPolicy Bypass -File .\auth-service\k8s\subir.ps1 -ImagemLocal
#
# O registro do auth cria o perfil no usuarios-service; por isso este script
# sobe PRIMEIRO o usuarios-service (usuarios-service\k8s\subir.ps1) e depois o auth.
# Passos: usuarios (Minikube, addons, manifests) -> (opcional) imagem local do
# auth -> kubectl apply -k -> espera os Deployments -> lista os pods.
# -ImagemLocal: usa o codigo da sua maquina (nos dois servicos) em vez das
# imagens publicadas no GHCR.
# Para acessar pelo navegador, depois rode "minikube tunnel" em outro terminal
# (ver k8s/README.md).
param(
    # memoria do Minikube em MB (o Docker Desktop precisa ter pelo menos isso livre)
    [int]$Memoria = 4096,
    [switch]$ImagemLocal
)
$pasta = $PSScriptRoot
$servico = 'auth-service'
$ns = 'auth'
function Parar-SeFalhou($passo) {
    if ($LASTEXITCODE -ne 0) { Write-Host "Falhou: $passo" -ForegroundColor Red; exit 1 }
}

Write-Host "== usuarios-service (o auth depende dele no registro)" -ForegroundColor Cyan
& "$pasta\..\..\usuarios-service\k8s\subir.ps1" -Memoria $Memoria -ImagemLocal:$ImagemLocal
Parar-SeFalhou 'subir o usuarios-service'

if ($ImagemLocal) {
    # a tag que o kustomization.yaml pede (ghcr.io/ratzmann/<servico>:<versao>)
    $tag = (Select-String -Path "$pasta\kustomization.yaml" -Pattern 'newTag:\s*(\S+)').Matches[0].Groups[1].Value
    $imagem = "ghcr.io/ratzmann/${servico}:$tag"
    Write-Host "== Construindo $imagem com o codigo local" -ForegroundColor Cyan
    docker build -t $imagem "$pasta\.."
    Parar-SeFalhou 'docker build'
    minikube image load $imagem
    Parar-SeFalhou 'minikube image load'
}

Write-Host "== Aplicando os manifests de $pasta" -ForegroundColor Cyan
kubectl apply -k $pasta
Parar-SeFalhou 'kubectl apply'
if ($ImagemLocal) { kubectl -n $ns rollout restart "deployment/$servico" }

Write-Host "== Esperando os Deployments ficarem prontos" -ForegroundColor Cyan
foreach ($d in 'auth-db', $servico, 'prometheus', 'grafana') {
    kubectl -n $ns rollout status "deployment/$d" --timeout=300s
}

Write-Host "== Evidencias" -ForegroundColor Cyan
kubectl -n $ns get deployments,pods,services,ingress,hpa -o wide

Write-Host ""
Write-Host "Pronto. Para acessar, rode em OUTRO terminal (deixe aberto):  minikube tunnel" -ForegroundColor Green
Write-Host "(nomes .localhost apontam sozinhos para o PC: nao precisa mexer no arquivo hosts)"
Write-Host "API:        http://auth.localhost/health   (Swagger em /docs)"
Write-Host "Grafana:    http://grafana-auth.localhost  (admin / admin)"
Write-Host "Prometheus: http://prometheus-auth.localhost/targets"
Write-Host "usuarios:   http://usuarios.localhost/health  |  http://grafana-usuarios.localhost"
