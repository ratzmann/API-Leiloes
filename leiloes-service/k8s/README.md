# leiloes-service no Kubernetes (T3)

Manifests para rodar o `leiloes-service` num cluster **Minikube** local, com
2 réplicas, banco próprio e Prometheus + Grafana dentro do cluster.
Resumo para a apresentação: [`../docs/T3-KUBERNETES.md`](../docs/T3-KUBERNETES.md).

## O que tem aqui

```
k8s/
├── kustomization.yaml        índice: aplica tudo com "kubectl apply -k" e define a imagem
├── namespace.yaml            namespace "leiloes"
├── app/                      o microsserviço
│   ├── configmap.yaml        variáveis não sensíveis (APP_ENV, DB_HOST, ...)
│   ├── secret.yaml           variáveis sensíveis (JWT_SECRET, CHAVE_INTERNA)
│   ├── deployment.yaml       2 réplicas, probes no /health, requests/limits
│   ├── service.yaml          leiloes-service:3003 (balanceia entre os pods)
│   ├── ingress.yaml          http://leiloes.localhost
│   └── hpa.yaml              escala de 2 até 5 pods pela CPU
├── banco/                    Postgres próprio do serviço
│   ├── secret.yaml           usuário, senha e nome do banco
│   ├── pvc.yaml              disco persistente de 1 GiB
│   ├── deployment.yaml       postgres:16-alpine (1 réplica)
│   └── service.yaml          leiloes-db:5432 (só dentro do cluster)
├── observabilidade/
│   ├── prometheus.yaml       Prometheus + permissão de listar os pods (RBAC)
│   ├── prometheus/prometheus.yml   descobre e coleta cada pod sozinho
│   ├── grafana.yaml          Grafana + Secret do admin
│   ├── grafana/              datasource, provedor e dashboard (viram ConfigMaps)
│   └── ingress.yaml          grafana-leiloes.localhost e prometheus-leiloes.localhost
└── subir.ps1                 sobe tudo de uma vez (Windows)
```

## Pré-requisitos

- Docker Desktop ligado;
- [Minikube](https://minikube.sigs.k8s.io/) (`winget install Kubernetes.minikube`);
- `kubectl` (já vem com o Docker Desktop).

## Como executar

Da raiz do repositório:

```powershell
# 1. sobe o Minikube, liga os addons, aplica os manifests e espera tudo ficar pronto
powershell -ExecutionPolicy Bypass -File .\leiloes-service\k8s\subir.ps1
```

Ou, passo a passo:

```powershell
minikube start --driver=docker --cpus=2 --memory=3000
minikube addons enable ingress          # controlador NGINX para o Ingress
minikube addons enable metrics-server   # métricas de CPU para o HPA
kubectl apply -k leiloes-service/k8s
kubectl -n leiloes get pods -w          # espera todos ficarem Running/Ready
```

A imagem é a publicada pelo pipeline no GHCR (`ghcr.io/ratzmann/leiloes-service:1.2.5`,
definida no `kustomization.yaml`). Para usar uma imagem construída localmente:

```powershell
docker build -t ghcr.io/ratzmann/leiloes-service:1.2.5 leiloes-service
minikube image load ghcr.io/ratzmann/leiloes-service:1.2.5
kubectl -n leiloes rollout restart deployment/leiloes-service
```

## Acessar

O Ingress responde pelos nomes `leiloes.localhost`, `grafana-leiloes.localhost` e
`prometheus-leiloes.localhost`. Nomes terminados em `.localhost` apontam sozinhos para o
próprio PC (127.0.0.1) no navegador: **não é preciso editar o arquivo hosts**.

No Windows (driver docker), deixe rodando em outro terminal: `minikube tunnel`
(ele publica o Ingress em 127.0.0.1; pode pedir permissão de administrador).

| O quê | Endereço |
|---|---|
| API (saúde) | http://leiloes.localhost/health |
| Swagger | http://leiloes.localhost/docs |
| Grafana (admin / admin) | http://grafana-leiloes.localhost (abre no dashboard "leiloes-service (Kubernetes)") |
| Prometheus | http://prometheus-leiloes.localhost/targets (um alvo por pod) |

Sem o tunnel, dá para usar `port-forward` (acesso direto aos Services, sem passar pelo Ingress):

```powershell
kubectl -n leiloes port-forward svc/leiloes-service 3003:3003   # http://localhost:3003
kubectl -n leiloes port-forward svc/grafana 3000:3000           # http://localhost:3000
kubectl -n leiloes port-forward svc/prometheus 9090:9090        # http://localhost:9090
```

## Evidências para a avaliação

```powershell
kubectl -n leiloes get deployments,pods -o wide   # leiloes-service 2/2 e os 2 pods
kubectl -n leiloes get hpa                        # mínimo 2, máximo 5
kubectl -n leiloes get configmap,secret,ingress,svc

# o Kubernetes recria um pod apagado (auto-recuperação)
kubectl -n leiloes delete pod -l app=leiloes-service --wait=false
kubectl -n leiloes get pods -w

# escalar na mão (com CPU baixa, o HPA volta para 2 depois de alguns minutos)
kubectl -n leiloes scale deployment/leiloes-service --replicas=3

# tráfego para movimentar o Grafana (usa o mesmo script do T2)
powershell -ExecutionPolicy Bypass -File .\leiloes-service\observabilidade\gerar-trafego.ps1 -BaseUrl http://leiloes.localhost

# teste automático (o mesmo do pipeline), com o tunnel ligado
bash leiloes-service/ci/testar-k8s.sh 127.0.0.1
```

## Desligar

```powershell
kubectl delete -k leiloes-service/k8s   # apaga o namespace e tudo dentro (inclusive o banco)
minikube stop                           # desliga o cluster
```
