# usuarios-service no Kubernetes (T3)

Manifests para rodar o `usuarios-service` num cluster **Minikube** local, com
2 réplicas, banco próprio e Prometheus + Grafana dentro do cluster.
Mesma estrutura do `leiloes-service/k8s` (padrão da equipe).
Resumo para a apresentação: [`../docs/T3-KUBERNETES.md`](../docs/T3-KUBERNETES.md).

## O que tem aqui

```
k8s/
├── kustomization.yaml        índice: aplica tudo com "kubectl apply -k" e define a imagem
├── namespace.yaml            namespace "usuarios"
├── app/                      o microsserviço
│   ├── configmap.yaml        variáveis não sensíveis (APP_ENV, DB_HOST, JWT_ISSUER, ...)
│   ├── secret.yaml           variáveis sensíveis (JWT_SECRET, CHAVE_INTERNA)
│   ├── deployment.yaml       2 réplicas, initContainer que espera o banco, probes no /health
│   ├── service.yaml          usuarios-service:3002 (balanceia entre os pods)
│   ├── ingress.yaml          http://usuarios.localhost
│   └── hpa.yaml              escala de 2 até 5 pods pela CPU
├── banco/                    Postgres próprio do serviço
│   ├── secret.yaml           usuário, senha e nome do banco
│   ├── pvc.yaml              disco persistente de 1 GiB
│   ├── deployment.yaml       postgres:16-alpine (1 réplica)
│   └── service.yaml          usuarios-db:5432 (só dentro do cluster)
├── observabilidade/
│   ├── prometheus.yaml       Prometheus + permissão de listar os pods (RBAC)
│   ├── prometheus/prometheus.yml   descobre e coleta cada pod sozinho
│   ├── grafana.yaml          Grafana + Secret do admin
│   ├── grafana/              datasource, provedor e dashboard (viram ConfigMaps)
│   └── ingress.yaml          grafana-usuarios.localhost e prometheus-usuarios.localhost
└── subir.ps1                 sobe tudo de uma vez (Windows)
```

**Quem chama este serviço dentro do cluster:** o auth-service (namespace `auth`), ao
registrar, cria o perfil pela rota interna em
`http://usuarios-service.usuarios.svc.cluster.local:3002` (DNS completo:
`<service>.<namespace>.svc.cluster.local`). O leiloes e o lances usam o mesmo endereço.

## Pré-requisitos

- Docker Desktop ligado;
- [Minikube](https://minikube.sigs.k8s.io/) (`winget install Kubernetes.minikube`);
- `kubectl` (já vem com o Docker Desktop).

## Como executar

Da raiz do repositório:

```powershell
# sobe o Minikube, liga os addons, aplica os manifests e espera tudo ficar pronto
powershell -ExecutionPolicy Bypass -File .\usuarios-service\k8s\subir.ps1

# com o código da sua máquina em vez da imagem do GHCR (ex.: antes da versão ser publicada)
powershell -ExecutionPolicy Bypass -File .\usuarios-service\k8s\subir.ps1 -ImagemLocal
```

Ou, passo a passo:

```powershell
minikube start --driver=docker --cpus=2 --memory=4096
minikube addons enable ingress          # controlador NGINX para o Ingress
minikube addons enable metrics-server   # métricas de CPU para o HPA
kubectl apply -k usuarios-service/k8s
kubectl -n usuarios get pods -w         # espera todos ficarem Running/Ready
```

A imagem é a publicada pelo pipeline no GHCR (`ghcr.io/ratzmann/usuarios-service:1.1.3`,
definida no `kustomization.yaml`). Para usar uma imagem construída localmente (é o que o
`-ImagemLocal` faz):

```powershell
docker build -t ghcr.io/ratzmann/usuarios-service:1.1.3 usuarios-service
minikube image load ghcr.io/ratzmann/usuarios-service:1.1.3
kubectl -n usuarios rollout restart deployment/usuarios-service
```

## Acessar

O Ingress responde pelos nomes `usuarios.localhost`, `grafana-usuarios.localhost` e
`prometheus-usuarios.localhost`. Nomes terminados em `.localhost` apontam sozinhos para o
próprio PC (127.0.0.1) no navegador: **não é preciso editar o arquivo hosts**.
(Cada serviço tem o seu Grafana/Prometheus; os nomes levam o serviço para não colidir
com os dos outros namespaces no mesmo Ingress.)

No Windows (driver docker), deixe rodando em outro terminal: `minikube tunnel`
(ele publica o Ingress em 127.0.0.1; pode pedir permissão de administrador).

| O quê | Endereço |
|---|---|
| API (saúde) | http://usuarios.localhost/health |
| Swagger | http://usuarios.localhost/docs |
| Grafana (admin / admin) | http://grafana-usuarios.localhost (abre no dashboard "usuarios-service (Kubernetes)") |
| Prometheus | http://prometheus-usuarios.localhost/targets (um alvo por pod) |

Sem o tunnel, dá para usar `port-forward` (acesso direto aos Services, sem passar pelo Ingress):

```powershell
kubectl -n usuarios port-forward svc/usuarios-service 3002:3002   # http://localhost:3002
kubectl -n usuarios port-forward svc/grafana 3000:3000            # http://localhost:3000
kubectl -n usuarios port-forward svc/prometheus 9090:9090         # http://localhost:9090
```

## Evidências para a avaliação

```powershell
kubectl -n usuarios get deployments,pods -o wide   # usuarios-service 2/2 e os 2 pods
kubectl -n usuarios get hpa                        # mínimo 2, máximo 5
kubectl -n usuarios get configmap,secret,ingress,svc

# o Kubernetes recria um pod apagado (auto-recuperação)
kubectl -n usuarios delete pod -l app=usuarios-service --wait=false
kubectl -n usuarios get pods -w

# escalar na mão (com CPU baixa, o HPA volta para 2 depois de alguns minutos)
kubectl -n usuarios scale deployment/usuarios-service --replicas=3

# tráfego para movimentar o Grafana (usa o mesmo script do T2)
powershell -ExecutionPolicy Bypass -File .\usuarios-service\observabilidade\gerar-trafego.ps1 -BaseUrl http://usuarios.localhost

# teste automático (o mesmo do pipeline), com o tunnel ligado (Git Bash)
bash usuarios-service/ci/testar-k8s.sh 127.0.0.1
```

## Desligar

```powershell
kubectl delete -k usuarios-service/k8s   # apaga o namespace e tudo dentro (inclusive o banco)
minikube stop                            # desliga o cluster
```
