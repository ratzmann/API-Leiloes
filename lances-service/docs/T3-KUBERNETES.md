# T3 — `lances-service` no Kubernetes (resumo para a apresentação)

> O que foi feito, como funciona e como mostrar. Instruções completas de execução:
> [`k8s/README.md`](https://github.com/ratzmann/API-Leiloes/blob/main/lances-service/k8s/README.md).

## Links

| O quê | Link |
|---|---|
| Repositório (branch `main`) | [github.com/ratzmann/API-Leiloes](https://github.com/ratzmann/API-Leiloes) |
| Manifests do Kubernetes (`k8s/`) | [lances-service/k8s](https://github.com/ratzmann/API-Leiloes/tree/main/lances-service/k8s) |
| Instruções de execução | [k8s/README.md](https://github.com/ratzmann/API-Leiloes/blob/main/lances-service/k8s/README.md) |
| Este resumo | [docs/T3-KUBERNETES.md](https://github.com/ratzmann/API-Leiloes/blob/main/lances-service/docs/T3-KUBERNETES.md) |
| Teste do cluster | [ci/testar-k8s.sh](https://github.com/ratzmann/API-Leiloes/blob/main/lances-service/ci/testar-k8s.sh) e [testes/testar-nuvem.js](https://github.com/ratzmann/API-Leiloes/blob/main/testes/testar-nuvem.js) (`k8s`) |
| Imagem usada no cluster (GHCR) | [ghcr.io/ratzmann/lances-service](https://github.com/ratzmann/API-Leiloes/pkgs/container/lances-service) (tag `1.1.3`) |
| Pipeline (GitHub Actions) | [Actions → lances-service](https://github.com/ratzmann/API-Leiloes/actions/workflows/lances-service.yml) |
| Render DEV / HOMOL (T2) | [lances-service-dev.onrender.com](https://lances-service-dev.onrender.com/health) / [lances-service-homol.onrender.com](https://lances-service-homol.onrender.com/health) |
| No cluster local (com `minikube tunnel`) | [lances.localhost/docs](http://lances.localhost/docs) · [grafana-lances.localhost](http://grafana-lances.localhost) · [prometheus-lances.localhost/targets](http://prometheus-lances.localhost/targets) |

## 1. Em uma frase

A **mesma imagem** que o pipeline do T2 publica no GHCR roda num cluster **Minikube**,
com **2 réplicas**, banco próprio, configuração por **ConfigMap/Secret**, acesso por
**Ingress**, **HPA** e **Prometheus + Grafana dentro do cluster**. Como a Saga do lance
precisa dos outros serviços, o `subir.ps1` do lances sobe o **sistema inteiro** (os 4
serviços, cada um no próprio namespace), e o teste integrado do T2 roda agora no cluster.

## 2. Requisitos × o que foi feito

| Requisito do T3 | Como cumprimos | Arquivo |
|---|---|---|
| 1. Aplicação funcionando por completo no cluster | os 4 serviços no Minikube; a Saga chama o leiloes e o usuarios pelo DNS do cluster; `testar-nuvem.js k8s` faz registro, leilão, lances e devolução de crédito | `k8s/app/configmap.yaml`, `k8s/subir.ps1` |
| 2. Minikube | cluster local com 4 CPUs e os addons `ingress` e `metrics-server` | `k8s/subir.ps1` |
| 3. Deployment, Service, ConfigMap, Secret, Ingress | um arquivo de cada para o serviço (e para o banco) | `k8s/app/*.yaml`, `k8s/banco/*.yaml` |
| 4. ConfigMap / Secret / sem configuração fixa | o código já lia tudo de variáveis de ambiente (T2); o ConfigMap e o Secret entram com `envFrom` | `k8s/app/configmap.yaml`, `secret.yaml` |
| 4.1 Mínimo de 2 réplicas | `replicas: 2` + HPA com `minReplicas: 2` (até 5) | `k8s/app/deployment.yaml`, `hpa.yaml` |
| 4.2 Evidência de vários pods | `kubectl get pods`, alvos do Prometheus (um por pod) e painel "Pods no ar" no Grafana | seção 7 (roteiro) |
| 5. Prometheus e Grafana no cluster | o Prometheus descobre os pods sozinho; o Grafana já sobe com o dashboard | `k8s/observabilidade/` |
| 6. Roda localmente | `subir.ps1` sobe tudo com um comando | `k8s/subir.ps1` |
| 7. Diretório `k8s/` + README | pasta `lances-service/k8s/` com README de execução | `k8s/README.md` |
| (objetivo) Manter CI/CD | o pipeline do T2 continua igual e publica no GHCR a imagem que o cluster usa; o T3 não pede CI/CD, então o teste do cluster é local | `ci/testar-k8s.sh` |

**Mudança de código: só o encerramento gracioso** (seção 4), o mesmo `utils/encerramento.js`
dos outros 3 serviços. O resto do T3 é infraestrutura. Versão **1.1.3** (patch), porque a
`main` não publica duas vezes a mesma versão.

## 3. Como funciona (desenho)

```
                 navegador / curl / testar-nuvem.js k8s
                              |  *.localhost
                              v
 +-------------------------------------------------------------------------+
 |                    Ingress (NGINX, addon do Minikube)                   |
 +-------------------------------------------------------------------------+
      |                 |                    |                     |
 ns auth           ns usuarios          ns leiloes            ns lances
 auth-service x2   usuarios-service x2  leiloes-service x2    lances-service x2
      |   registro      ^    ^    reserva/libera  ^   disponibilidade  |
      +-----------------+    +--------------------|--------------------+
                             +--------------------+  (cancelar libera)
 auth-db           usuarios-db          leiloes-db            lances-db + PVC
 prometheus        prometheus           prometheus            prometheus
 grafana           grafana              grafana               grafana

 dentro do namespace lances:
   Service lances-service --> pod 1, pod 2  <-- Prometheus coleta /metrics de cada pod
   ConfigMap + Secret -> variáveis de ambiente dos pods
```

## 4. Os trechos que importam

**Ligação entre namespaces** (`k8s/app/configmap.yaml`): cada serviço tem o próprio
namespace; o nome curto (`leiloes-service`) só vale dentro do mesmo namespace, então a Saga
usa o DNS completo do cluster, `<service>.<namespace>.svc.cluster.local`:

```yaml
LEILOES_SERVICE_URL: "http://leiloes-service.leiloes.svc.cluster.local:3003"
USUARIOS_SERVICE_URL: "http://usuarios-service.usuarios.svc.cluster.local:3002"
SAGA_PERMITIR_FALHA_SIMULADA: "true"   # demonstração da compensação, como no local
```

O ConfigMap do leiloes vem com a `USUARIOS_SERVICE_URL` vazia (para rodar sozinho). Com o
sistema inteiro, o `subir.ps1` liga os dois com `kubectl set env` no Deployment do leiloes
(o `env` vale mais que o `envFrom`), sem mexer nos arquivos do colega.

**Deployment** (`k8s/app/deployment.yaml`): 2 réplicas, configuração de fora e sondas de saúde.

```yaml
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: lances-service
          image: lances-service          # tag real no kustomization.yaml (1.1.3 do GHCR)
          envFrom:
            - configMapRef: { name: lances-service-config }   # APP_ENV, DB_HOST, URLs da Saga...
            - secretRef:    { name: lances-service-secret }   # JWT_SECRET, CHAVE_INTERNA
          readinessProbe: { httpGet: { path: /health, port: http } }  # só recebe tráfego quando pronto
          livenessProbe:  { httpGet: { path: /health, port: http } }  # travou? reinicia
```

**initContainer `esperar-banco`**: antes do serviço, um container com `pg_isready` espera o
Postgres aceitar conexões, para os pods não reiniciarem enquanto o banco sobe.

**Encerramento gracioso (SIGTERM)** (`src/utils/encerramento.js`, chamado no `server.js`):
ao apagar ou trocar um pod, o Kubernetes manda SIGTERM. O serviço termina as requisições
em andamento (uma Saga no meio, por exemplo), fecha o banco e sai, em vez de ser morto
depois de 30 s.

**Prometheus descobrindo os pods** (`k8s/observabilidade/prometheus/prometheus.yml`):
pergunta à API do Kubernetes quais pods existem (por isso o `Role` de leitura) e guarda
só os pods com `app=lances-service`, com o rótulo `pod` nos gráficos.

**Grafana**: o dashboard do T2 ganhou a linha "Kubernetes" (pods no ar, requisições por pod,
CPU por pod), mais os lances gravados e as sagas por status final.

**CPU do cluster**: os 4 serviços juntos pedem mais CPU do que as 2 CPUs padrão do
Minikube, então o `subir.ps1` cria o cluster com 4 CPUs, e o banco, o Prometheus e o Grafana
do lances pedem só `50m` de CPU (como no auth e no usuarios).

## 5. Imagem e teste do cluster

```
feature/* ─► ci (testes, Sonar) ─► imagem (só build)
develop   ─► ci ─► versao ─► imagem (GHCR :dev)   ─► deploy DEV   (Render)
main      ─► ci ─► versao ─► imagem (GHCR :1.1.3) ─► deploy HOMOL (Render)
```

Antes de a `1.1.3` chegar à `main`, use `subir.ps1 -ImagemLocal` (constrói a imagem com o
código da máquina e carrega no Minikube).

Testes do cluster (com o `minikube tunnel` ligado):
- `bash lances-service/ci/testar-k8s.sh 127.0.0.1`: 2+ pods prontos, `/health` pelo Ingress,
  `GET /lances` (banco), lance num leilão inexistente responde `404` do leiloes (a Saga
  alcança o outro namespace; `503` seria o leiloes fora do ar) e Prometheus coletando de
  2+ pods;
- `node testes/testar-nuvem.js k8s`: as 21 conferências do teste integrado do T2
  (registro, login, leilão, 2 lances pela Saga, crédito reservado e devolvido, recusas e
  cancelamento), agora no cluster.

**Verificado localmente** (25/11/2026, Minikube 1.39, `subir.ps1 -ImagemLocal`): os 4
serviços sobem com 2/2 pods e sem reinícios; `ci/testar-k8s.sh` passou nos 5 itens;
`testar-nuvem.js k8s` deu **21/21**; um pod apagado sai na hora (log: "Sinal SIGTERM
recebido... Encerrado sem pendencias") e o Kubernetes cria outro; o HPA lê a CPU (9%/70%)
e o Grafana abre no dashboard "lances-service (Kubernetes)".

## 6. Como rodar (passo a passo)

**Pré-requisitos** (uma vez só):
- **Docker Desktop** instalado e **aberto**, com pelo menos 4 CPUs e 6 GB livres;
- **Minikube**: `winget install Kubernetes.minikube`;
- **kubectl**: já vem com o Docker Desktop.

**Subir** (na pasta `API-Leiloes`):

```powershell
# terminal 1: Minikube + os 4 servicos (auth, usuarios, leiloes e lances)
powershell -ExecutionPolicy Bypass -File .\lances-service\k8s\subir.ps1

# terminal 2: publica o Ingress em 127.0.0.1 - DEIXE ABERTO durante a apresentação
minikube tunnel
```

| O quê | Endereço |
|---|---|
| API (saúde) | http://lances.localhost/health |
| Swagger | http://lances.localhost/docs |
| Grafana (admin / admin) | http://grafana-lances.localhost |
| Prometheus (um alvo por pod) | http://prometheus-lances.localhost/targets |

**Se algo der errado:**

| Problema | Solução |
|---|---|
| Pods `Pending` (falta CPU) | o Minikube foi criado com 2 CPUs por outro script: `minikube delete` e rode o `subir.ps1` de novo |
| Todo lance responde `503` | o leiloes ou o usuarios não está no ar: `kubectl get pods -A` |
| "Docker Desktop tem apenas X MB de memória" | `subir.ps1 -Memoria 5000` (o padrão é 6144 MB) |
| Endereços `.localhost` não abrem | confira se o `minikube tunnel` está aberto no outro terminal |

**Desligar:** `minikube stop` (os dados ficam). Para apagar o serviço:
`kubectl delete -k lances-service/k8s`.

## 7. Roteiro da demonstração (5 minutos)

```powershell
# 0. (antes da aula) seção 6: subir.ps1 + minikube tunnel aberto

# 1. múltiplos pods (requisito 4.2): os 4 servicos com 2/2
kubectl get deployments -A
kubectl -n lances get pods -o wide

# 2. recursos pedidos
kubectl -n lances get configmap,secret,svc,ingress,hpa

# 3. o sistema inteiro funcionando no cluster (Saga do lance)
node testes/testar-nuvem.js k8s

# 4. auto-recuperação: apaga os pods e o Kubernetes cria outros
kubectl -n lances delete pod -l app=lances-service --wait=false
kubectl -n lances get pods -w

# 5. observabilidade
#    http://grafana-lances.localhost            -> "Pods no ar" = 2, lances gravados, sagas por status
#    http://prometheus-lances.localhost/targets -> um alvo por pod

# 6. teste automático do cluster (Git Bash)
bash lances-service/ci/testar-k8s.sh 127.0.0.1
```

## 8. Perguntas prováveis

- **Por que o lances sobe os outros serviços?** A Saga do lance consulta o leilão no
  leiloes e reserva o crédito no usuarios; sem eles, todo lance responde `503`. Os
  manifests de cada serviço continuam na pasta de cada um; o script só aplica todos.
- **Por que o DNS completo (`.svc.cluster.local`)?** Cada serviço está no próprio
  namespace, e o nome curto do Service só resolve dentro do mesmo namespace.
- **Uma Saga no meio quando o pod é apagado?** O encerramento gracioso espera as
  requisições em andamento terminarem antes de sair; e as sagas com pendência ficam
  gravadas no banco para o reprocessamento (`POST /lances/sagas/:id/reprocessar`).
- **Por que o banco tem 1 réplica?** O banco guarda estado e o disco (PVC) é de um pod só.
  Quem precisa de réplicas é o serviço, que não guarda estado.
- **Secret no Git?** São os valores de desenvolvimento (os mesmos do `.env.example`). Num
  cluster real, o Secret é criado com `kubectl create secret` e não vai para o repositório.
