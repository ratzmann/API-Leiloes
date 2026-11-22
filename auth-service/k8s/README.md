# auth-service no Kubernetes (T3)

Manifests para rodar o `auth-service` num cluster **Minikube** local, com
2 réplicas, banco próprio e Prometheus + Grafana dentro do cluster.
Mesma estrutura do `leiloes-service/k8s` (padrão da equipe).
Resumo para a apresentação: [`../docs/T3-KUBERNETES.md`](../docs/T3-KUBERNETES.md).

## O que tem aqui

```
k8s/
├── kustomization.yaml        índice: aplica tudo com "kubectl apply -k" e define a imagem
├── namespace.yaml            namespace "auth"
├── app/                      o microsserviço
│   ├── configmap.yaml        variáveis não sensíveis (APP_ENV, DB_HOST, USUARIOS_SERVICE_URL, ...)
│   ├── secret.yaml           variáveis sensíveis (JWT_SECRET, CHAVE_INTERNA)
│   ├── deployment.yaml       2 réplicas, initContainer que espera o banco, probes no /health
│   ├── service.yaml          auth-service:3001 (balanceia entre os pods)
│   ├── ingress.yaml          http://auth.localhost
│   └── hpa.yaml              escala de 2 até 5 pods pela CPU
├── banco/                    Postgres próprio do serviço
│   ├── secret.yaml           usuário, senha e nome do banco
│   ├── pvc.yaml              disco persistente de 1 GiB
│   ├── deployment.yaml       postgres:16-alpine (1 réplica)
│   └── service.yaml          auth-db:5432 (só dentro do cluster)
├── observabilidade/
│   ├── prometheus.yaml       Prometheus + permissão de listar os pods (RBAC)
│   ├── prometheus/prometheus.yml   descobre e coleta cada pod sozinho
│   ├── grafana.yaml          Grafana + Secret do admin
│   ├── grafana/              datasource, provedor e dashboard (viram ConfigMaps)
│   └── ingress.yaml          grafana-auth.localhost e prometheus-auth.localhost
└── subir.ps1                 sobe tudo de uma vez (Windows)
```

**Depende do usuarios-service.** No registro, o auth grava a credencial no próprio
banco e cria o perfil (leiloeiro/licitante) no usuarios-service, que roda em **outro
namespace**: `USUARIOS_SERVICE_URL=http://usuarios-service.usuarios.svc.cluster.local:3002`
(DNS completo: `<service>.<namespace>.svc.cluster.local`), com o header
`X-Chave-Interna`. Por isso o `subir.ps1` sobe **primeiro** o
[`usuarios-service/k8s`](../../usuarios-service/k8s/README.md). Se o perfil falhar, a
compensação apaga a credencial (o registro responde `503`). Para rodar o auth sozinho
(como no T2), deixe `USUARIOS_SERVICE_URL` vazio no ConfigMap: o registro só cria a
credencial e o perfil volta `null`.

O `JWT_SECRET` e o `JWT_ISSUER` daqui assinam os tokens; o usuarios (e o leiloes e o
lances) conferem com os mesmos valores. A `CHAVE_INTERNA` também é a mesma nos 4.

## Pré-requisitos

- Docker Desktop ligado;
- [Minikube](https://minikube.sigs.k8s.io/) (`winget install Kubernetes.minikube`);
- `kubectl` (já vem com o Docker Desktop).

## Como executar

Da raiz do repositório:

```powershell
# sobe o Minikube, liga os addons, aplica os manifests do usuarios e do auth
# e espera tudo ficar pronto
powershell -ExecutionPolicy Bypass -File .\auth-service\k8s\subir.ps1

# com o código da sua máquina em vez da imagem do GHCR (ex.: antes da versão ser publicada)
powershell -ExecutionPolicy Bypass -File .\auth-service\k8s\subir.ps1 -ImagemLocal
```

Ou, passo a passo:

```powershell
minikube start --driver=docker --cpus=2 --memory=4096
minikube addons enable ingress          # controlador NGINX para o Ingress
minikube addons enable metrics-server   # métricas de CPU para o HPA
kubectl apply -k usuarios-service/k8s   # primeiro o usuarios (o registro cria o perfil nele)
kubectl apply -k auth-service/k8s
kubectl get pods -n usuarios; kubectl -n auth get pods -w   # espera todos ficarem Running/Ready
```

A imagem é a publicada pelo pipeline no GHCR (`ghcr.io/ratzmann/auth-service:1.1.3`,
definida no `kustomization.yaml`). Para usar uma imagem construída localmente (é o que o
`-ImagemLocal` faz):

```powershell
docker build -t ghcr.io/ratzmann/auth-service:1.1.3 auth-service
minikube image load ghcr.io/ratzmann/auth-service:1.1.3
kubectl -n auth rollout restart deployment/auth-service
```

## Acessar

O Ingress responde pelos nomes `auth.localhost`, `grafana-auth.localhost` e
`prometheus-auth.localhost`. Nomes terminados em `.localhost` apontam sozinhos para o
próprio PC (127.0.0.1) no navegador: **não é preciso editar o arquivo hosts**.
(Cada serviço tem o seu Grafana/Prometheus; os nomes levam o serviço para não colidir
com os dos outros namespaces no mesmo Ingress.)

No Windows (driver docker), deixe rodando em outro terminal: `minikube tunnel`
(ele publica o Ingress em 127.0.0.1; pode pedir permissão de administrador).

| O quê | Endereço |
|---|---|
| API (saúde) | http://auth.localhost/health |
| Swagger | http://auth.localhost/docs |
| Grafana (admin / admin) | http://grafana-auth.localhost (abre no dashboard "auth-service (Kubernetes)") |
| Prometheus | http://prometheus-auth.localhost/targets (um alvo por pod) |

Sem o tunnel (ele pode pedir administrador), dá para publicar o próprio Ingress numa porta
local; os nomes continuam valendo, só com a porta: `http://auth.localhost:8080`,
`http://grafana-auth.localhost:8080` (e `bash auth-service/ci/testar-k8s.sh 127.0.0.1:8080`):

```powershell
kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller 8080:80
```

Ou `port-forward` direto nos Services (sem passar pelo Ingress; vai sempre para um pod só):

```powershell
kubectl -n auth port-forward svc/auth-service 3001:3001   # http://localhost:3001
kubectl -n auth port-forward svc/grafana 3000:3000            # http://localhost:3000
kubectl -n auth port-forward svc/prometheus 9090:9090         # http://localhost:9090
```

> **PowerShell × `.localhost`:** o navegador e o `curl.exe` resolvem `*.localhost` sozinhos,
> mas o PowerShell 5.1 (`Invoke-RestMethod`) não. Nele, chame `http://127.0.0.1` com o header
> `Host` (como no registro abaixo). O `gerar-trafego.ps1` já faz isso sozinho.

## Evidências para a avaliação

```powershell
kubectl -n auth get deployments,pods -o wide   # auth-service 2/2 e os 2 pods
kubectl -n auth get hpa                        # mínimo 2, máximo 5
kubectl -n auth get configmap,secret,ingress,svc

# registro atravessando namespaces: credencial no auth-db, perfil no usuarios-service
# (troque o e-mail e o registro a cada execucao; a resposta traz "perfil" e "token")
Invoke-RestMethod -Method Post http://127.0.0.1/registrar -Headers @{ Host = 'auth.localhost' } -ContentType application/json -Body '{"nome":"Leiloeiro Demo","email":"demo1@teste.com","senha":"senha123","papel":"LEILOEIRO","dadosPerfil":{"registroProfissional":"DEMO-0001"}}'

# o Kubernetes recria um pod apagado (auto-recuperação)
kubectl -n auth delete pod -l app=auth-service --wait=false
kubectl -n auth get pods -w

# escalar na mão (com CPU baixa, o HPA volta para 2 depois de alguns minutos)
kubectl -n auth scale deployment/auth-service --replicas=3

# tráfego para movimentar o Grafana (usa o mesmo script do T2)
powershell -ExecutionPolicy Bypass -File .\auth-service\observabilidade\gerar-trafego.ps1 -BaseUrl http://auth.localhost

# teste automático, com o tunnel ligado (Git Bash)
bash auth-service/ci/testar-k8s.sh 127.0.0.1
```

## Desligar

```powershell
kubectl delete -k auth-service/k8s       # apaga o namespace e tudo dentro (inclusive o banco)
kubectl delete -k usuarios-service/k8s   # idem para o usuarios
minikube stop                            # desliga o cluster
```
