# Sobe o lances-service no Minikube (T3) JUNTO com os outros 3 servicos e mostra as evidencias.
#   powershell -ExecutionPolicy Bypass -File .\lances-service\k8s\subir.ps1
#   powershell -ExecutionPolicy Bypass -File .\lances-service\k8s\subir.ps1 -ImagemLocal
#
# A Saga do lance consulta o leiloes-service e reserva/libera credito no
# usuarios-service: sem eles, todo lance responde 503. Por isso este script sobe
# o SISTEMA INTEIRO, cada servico no proprio namespace, usando os subir.ps1 dos colegas:
#   1. Minikube com 4 CPUs (os 4 servicos juntos nao cabem nas 2 CPUs padrao);
#   2. auth-service\k8s\subir.ps1 (que sobe antes o usuarios-service);
#   3. leiloes-service\k8s\subir.ps1 e liga o leiloes ao usuarios (valida o leiloeiro
#      e libera o credito ao cancelar), que no ConfigMap dele vem desligado;
#   4. (opcional) imagem local do lances -> kubectl apply -k -> espera os Deployments.
# -ImagemLocal: usa o codigo da sua maquina (no auth, no usuarios e no lances) em vez
# das imagens publicadas no GHCR (util antes da versao do kustomization.yaml ser
# publicada pela main).
# Para acessar pelo navegador, depois rode "minikube tunnel" em outro terminal
# (ver k8s/README.md).
param(
    # memoria do Minikube em MB (o Docker Desktop precisa ter pelo menos isso livre)
    [int]$Memoria = 6144,
    # CPUs do Minikube (os pedidos de CPU dos 4 servicos passam de 2 CPUs)
    [int]$Cpus = 4,
    [switch]$ImagemLocal
)
$pasta = $PSScriptRoot
$raiz = Resolve-Path "$pasta\..\.."
$servico = 'lances-service'
$ns = 'lances'
function Parar-SeFalhou($passo) {
    if ($LASTEXITCODE -ne 0) { Write-Host "Falhou: $passo" -ForegroundColor Red; exit 1 }
}

Write-Host "== Minikube ($Cpus CPUs, $Memoria MB)" -ForegroundColor Cyan
minikube status | Out-Null
if ($LASTEXITCODE -ne 0) {
    minikube start --driver=docker --cpus=$Cpus --memory=$Memoria
    Parar-SeFalhou 'minikube start'
} else {
    Write-Host "Minikube ja estava ligado (se foi criado com 2 CPUs e algum pod ficar Pending:"
    Write-Host "  minikube delete; e rode este script de novo)"
}

Write-Host "== auth-service e usuarios-service (o lance reserva credito no usuarios)" -ForegroundColor Cyan
& "$raiz\auth-service\k8s\subir.ps1" -Memoria $Memoria -ImagemLocal:$ImagemLocal
Parar-SeFalhou 'subir o auth-service e o usuarios-service'

Write-Host "== leiloes-service (o lance consulta a disponibilidade do leilao)" -ForegroundColor Cyan
& "$raiz\leiloes-service\k8s\subir.ps1" -Memoria $Memoria
Parar-SeFalhou 'subir o leiloes-service'
# o ConfigMap do leiloes vem com USUARIOS_SERVICE_URL vazia (servico sozinho).
# Com o sistema inteiro, "kubectl set env" grava a URL no Deployment do leiloes
# (o "env" vale mais que o "envFrom" do ConfigMap) e ja recria os pods.
# Para desligar de novo: kubectl -n leiloes set env deployment/leiloes-service USUARIOS_SERVICE_URL-
kubectl -n leiloes set env deployment/leiloes-service `
    USUARIOS_SERVICE_URL=http://usuarios-service.usuarios.svc.cluster.local:3002
Parar-SeFalhou 'ligar o leiloes ao usuarios'
kubectl -n leiloes rollout status deployment/leiloes-service --timeout=300s

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
foreach ($d in 'lances-db', $servico, 'prometheus', 'grafana') {
    kubectl -n $ns rollout status "deployment/$d" --timeout=300s
}

Write-Host "== Evidencias" -ForegroundColor Cyan
kubectl -n $ns get deployments,pods,services,ingress,hpa -o wide
Write-Host ""
Write-Host "Os 4 servicos (2 pods cada):"
kubectl get deployments -A -l 'app in (auth-service,usuarios-service,leiloes-service,lances-service)'

Write-Host ""
Write-Host "Pronto. Para acessar, rode em OUTRO terminal (deixe aberto):  minikube tunnel" -ForegroundColor Green
Write-Host "(nomes .localhost apontam sozinhos para o PC: nao precisa mexer no arquivo hosts)"
Write-Host "API:        http://lances.localhost/health   (Swagger em /docs)"
Write-Host "Grafana:    http://grafana-lances.localhost  (admin / admin)"
Write-Host "Prometheus: http://prometheus-lances.localhost/targets"
Write-Host "Teste do sistema inteiro (Saga):  node testes/testar-nuvem.js k8s"
