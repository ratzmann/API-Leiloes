# lances-service no Kubernetes (T3)

Manifests para rodar o `lances-service` num cluster **Minikube** local, com 2 réplicas,
banco próprio e Prometheus + Grafana dentro do cluster.
Resumo para a apresentação: [`../docs/T3-KUBERNETES.md`](../docs/T3-KUBERNETES.md).

O lances é o único serviço que **não funciona sozinho**: a Saga do lance consulta o
`leiloes-service` (o leilão está aceitando lances?) e reserva e libera crédito no
`usuarios-service`. Por isso o `subir.ps1` daqui sobe o **sistema inteiro**, com cada
serviço no próprio namespace, usando os manifests e os scripts de cada um.

```
namespace auth       namespace usuarios      namespace leiloes      namespace lances
auth-service x2 ───▶ usuarios-service x2 ◀── leiloes-service x2 ◀── lances-service x2
auth-db               usuarios-db        ◀───────────────────────── (Saga: reserva/libera)
prometheus, grafana   prometheus, grafana    leiloes-db             lances-db
                                             prometheus, grafana    prometheus, grafana
```

Entre namespaces, o endereço usa o DNS completo do cluster
(`<service>.<namespace>.svc.cluster.local`), definido no `app/configmap.yaml`:

| Variável | Valor no cluster |
|---|---|
| `LEILOES_SERVICE_URL` | `http://leiloes-service.leiloes.svc.cluster.local:3003` |
| `USUARIOS_SERVICE_URL` | `http://usuarios-service.usuarios.svc.cluster.local:3002` |

## O que tem aqui

```
k8s/
├── kustomization.yaml        índice: aplica tudo com "kubectl apply -k" e define a imagem
├── namespace.yaml            namespace "lances"
├── app/                      o microsserviço
│   ├── configmap.yaml        variáveis não sensíveis (APP_ENV, DB_HOST, URLs da Saga, ...)
│   ├── secret.yaml           variáveis sensíveis (JWT_SECRET, CHAVE_INTERNA)
│   ├── deployment.yaml       2 réplicas, probes no /health, requests/limits
│   ├── service.yaml          lances-service:3003 (balanceia entre os pods)
│   ├── ingress.yaml          http://lances.localhost
│   └── hpa.yaml              escala de 2 até 5 pods pela CPU
├── banco/                    Postgres próprio do serviço
│   ├── secret.yaml           usuário, senha e nome do banco
│   ├── pvc.yaml              disco persistente de 1 GiB
│   ├── deployment.yaml       postgres:16-alpine (1 réplica)
│   └── service.yaml          lances-db:5432 (só dentro do cluster)
├── observabilidade/
│   ├── prometheus.yaml       Prometheus + permissão de listar os pods (RBAC)
│   ├── prometheus/prometheus.yml   descobre e coleta cada pod sozinho
│   ├── grafana.yaml          Grafana + Secret do admin
│   ├── grafana/              datasource, provedor e dashboard (viram ConfigMaps)
│   └── ingress.yaml          grafana-lances.localhost e prometheus-lances.localhost
└── subir.ps1                 sobe o sistema inteiro de uma vez (Windows)
```

## Pré-requisitos

- Docker Desktop ligado, com pelo menos **4 CPUs e 6 GB** livres para o Minikube;
- [Minikube](https://minikube.sigs.k8s.io/) (`winget install Kubernetes.minikube`);
- `kubectl` (já vem com o Docker Desktop).

## Como executar

Da raiz do repositório:

```powershell
# sobe o Minikube (4 CPUs), os 4 servicos e espera tudo ficar pronto
powershell -ExecutionPolicy Bypass -File .\lances-service\k8s\subir.ps1

# o mesmo, construindo as imagens com o codigo da maquina (antes de a versao sair na main)
powershell -ExecutionPolicy Bypass -File .\lances-service\k8s\subir.ps1 -ImagemLocal
```

Os 4 serviços juntos pedem mais CPU do que as 2 CPUs padrão. Se o Minikube já tiver sido
criado com 2 CPUs (pelo script de outro serviço) e algum pod ficar `Pending`, recrie o
cluster com `minikube delete` e rode o script de novo.

Ou, passo a passo:

```powershell
minikube start --driver=docker --cpus=4 --memory=6144
minikube addons enable ingress          # controlador NGINX para o Ingress
minikube addons enable metrics-server   # métricas de CPU para o HPA
kubectl apply -k usuarios-service/k8s
kubectl apply -k auth-service/k8s
kubectl apply -k leiloes-service/k8s
# liga o leiloes ao usuarios (no ConfigMap dele a URL vem vazia: servico sozinho)
kubectl -n leiloes set env deployment/leiloes-service USUARIOS_SERVICE_URL=http://usuarios-service.usuarios.svc.cluster.local:3002
kubectl apply -k lances-service/k8s
kubectl -n lances get pods -w           # espera todos ficarem Running/Ready
```

A imagem é a publicada pelo pipeline no GHCR (`ghcr.io/ratzmann/lances-service:1.1.3`,
definida no `kustomization.yaml`). Para usar uma imagem construída localmente sem o script:

```powershell
docker build -t ghcr.io/ratzmann/lances-service:1.1.3 lances-service
minikube image load ghcr.io/ratzmann/lances-service:1.1.3
kubectl -n lances rollout restart deployment/lances-service
```

## Acessar

O Ingress responde pelos nomes `lances.localhost`, `grafana-lances.localhost` e
`prometheus-lances.localhost` (e os dos outros serviços: `auth.localhost`,
`usuarios.localhost`, `leiloes.localhost`...). Nomes terminados em `.localhost` apontam
sozinhos para o próprio PC (127.0.0.1): **não é preciso editar o arquivo hosts**.

No Windows (driver docker), deixe rodando em outro terminal: `minikube tunnel`
(ele publica o Ingress em 127.0.0.1; pode pedir permissão de administrador).

| O quê | Endereço |
|---|---|
| API (saúde) | http://lances.localhost/health |
| Swagger | http://lances.localhost/docs |
| Grafana (admin / admin) | http://grafana-lances.localhost (abre no dashboard "lances-service (Kubernetes)") |
| Prometheus | http://prometheus-lances.localhost/targets (um alvo por pod) |

Sem o tunnel, dá para usar `port-forward` (acesso direto aos Services, sem passar pelo Ingress):

```powershell
kubectl -n lances port-forward svc/lances-service 3003:3003   # http://localhost:3003
kubectl -n lances port-forward svc/grafana 3000:3000          # http://localhost:3000
kubectl -n lances port-forward svc/prometheus 9090:9090       # http://localhost:9090
```

## Evidências para a avaliação

```powershell
kubectl get deployments -A                       # os 4 servicos com 2/2
kubectl -n lances get deployments,pods -o wide   # lances-service 2/2 e os 2 pods
kubectl -n lances get hpa                        # mínimo 2, máximo 5
kubectl -n lances get configmap,secret,ingress,svc

# o sistema inteiro funcionando no cluster: registro, leilao, Saga do lance,
# credito reservado e devolvido (o mesmo teste integrado do T2, agora no k8s)
node testes/testar-nuvem.js k8s

# o Kubernetes recria um pod apagado (auto-recuperação)
kubectl -n lances delete pod -l app=lances-service --wait=false
kubectl -n lances get pods -w

# escalar na mão (com CPU baixa, o HPA volta para 2 depois de alguns minutos)
kubectl -n lances scale deployment/lances-service --replicas=3

# tráfego para movimentar o Grafana: rode o teste integrado algumas vezes
# (o gerar-trafego.ps1 do T2 fala com o Kong, que não existe no cluster)
node testes/testar-nuvem.js k8s

# teste automático do cluster do lances (Git Bash), com o tunnel ligado
bash lances-service/ci/testar-k8s.sh 127.0.0.1
```

## Desligar

```powershell
kubectl delete -k lances-service/k8s   # apaga o namespace lances e tudo dentro (inclusive o banco)
minikube stop                          # desliga o cluster (os outros servicos voltam no proximo start)
```
