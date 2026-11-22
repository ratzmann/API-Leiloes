# T3 — `leiloes-service` no Kubernetes (resumo para a apresentação)

> O que foi feito, como funciona e como mostrar. Instruções completas de execução:
> [`k8s/README.md`](../k8s/README.md).

## 1. Em uma frase

A **mesma imagem** que o pipeline do T2 publica no GHCR agora roda num cluster
**Minikube**, com **2 réplicas**, banco próprio, configuração por **ConfigMap/Secret**,
acesso por **Ingress**, **HPA** para escalar e **Prometheus + Grafana dentro do cluster**.
O pipeline ganhou um job que sobe um Minikube e testa os manifests antes de publicar a imagem.

## 2. Requisitos × o que foi feito

| Requisito do T3 | Como cumprimos | Arquivo |
|---|---|---|
| 1. Aplicação funcionando no cluster | serviço + Postgres no namespace `leiloes`; cadastro e listagem de leilões testados pelo Ingress | `k8s/app/`, `k8s/banco/` |
| 2. Minikube | cluster local com os addons `ingress` e `metrics-server` | `k8s/subir.ps1` |
| 3. Deployment, Service, ConfigMap, Secret, Ingress | um arquivo de cada para o serviço (e para o banco) | `k8s/app/*.yaml` |
| 4. ConfigMap / Secret / sem configuração fixa | o código já lia tudo de variáveis de ambiente (T2); o ConfigMap e o Secret entram com `envFrom` | `k8s/app/configmap.yaml`, `secret.yaml` |
| 4.1 Mínimo de 2 réplicas | `replicas: 2` + HPA com `minReplicas: 2` (até 5) | `k8s/app/deployment.yaml`, `hpa.yaml` |
| 4.2 Evidência de vários pods | `kubectl get pods`, alvos do Prometheus (um por pod) e painel "Pods no ar" no Grafana | seção 7 (roteiro) |
| 5. Prometheus e Grafana no cluster | Prometheus descobre os pods sozinho; Grafana já sobe com o dashboard | `k8s/observabilidade/` |
| 6. Roda localmente | `subir.ps1` sobe tudo com um comando | `k8s/subir.ps1` |
| 7. Diretório `k8s/` + README | pasta `leiloes-service/k8s/` com README de execução | `k8s/README.md` |
| (objetivo) Manter CI/CD | job `k8s` no workflow: Minikube no runner, `kubectl apply -k` e testes; só depois publica a imagem | `.github/workflows/leiloes-service.yml`, `ci/testar-k8s.sh` |

**Mudança de código: nenhuma.** O T2 já tinha deixado tudo configurável por ambiente
(`src/config/ambiente.js`, `src/config/db.js`), então o T3 é só infraestrutura.
A versão subiu para **1.2.5** (patch), porque a `main` não publica duas vezes a mesma versão.

## 3. Como funciona (desenho)

```
  navegador / curl
       |   leiloes / grafana-leiloes / prometheus-leiloes  (.localhost)
       v
 +-----------------------------------------------------------------------+
 |                  Ingress (NGINX, addon do Minikube)                   |
 +-----------------------------------------------------------------------+
       |                                |                     |
       v                                v                     v
 +---------------------------+   +-------------+       +----------------+
 | Service leiloes-service   |   | Service     |       | Service        |
 | (reparte entre os pods)   |   | grafana     |       | prometheus     |
 +---------------------------+   +-------------+       +----------------+
       |               |                |                     |
       v               v                v                     v
 +-----------+   +-----------+   +-------------+  consulta +------------+
 |   pod 1   |   |   pod 2   |   |   Grafana   |---------->| Prometheus |
 +-----------+   +-----------+   +-------------+           +------------+
    ^     |         ^     |                                      |
    |     |         |     |   coleta /metrics de cada pod        |
    +-----|---------+-----|--------------------------------------+
          |               |
          v               v
 +---------------------------+
 | Service leiloes-db        |---> Postgres (1 réplica) + PVC de 1 GiB
 +---------------------------+

 ConfigMap + Secret -> variáveis de ambiente dos pods      namespace: leiloes
```

## 4. Os trechos que importam

**Deployment** (`k8s/app/deployment.yaml`): 2 réplicas, config de fora, sondas de saúde.

```yaml
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: leiloes-service
          image: leiloes-service          # tag real no kustomization.yaml (1.2.5 do GHCR)
          envFrom:
            - configMapRef: { name: leiloes-service-config }   # APP_ENV, DB_HOST...
            - secretRef:    { name: leiloes-service-secret }   # JWT_SECRET, CHAVE_INTERNA
          readinessProbe: { httpGet: { path: /health, port: http } }  # só recebe tráfego pronto
          livenessProbe:  { httpGet: { path: /health, port: http } }  # travou? reinicia
          resources: { requests: { cpu: 100m, memory: 128Mi }, limits: { cpu: 500m, memory: 256Mi } }
```

**initContainer `esperar-banco`**: antes do serviço, um container com `pg_isready`
espera o Postgres aceitar conexões. Sem ele, os pods reiniciavam algumas vezes
enquanto o banco subia.

**ConfigMap × Secret**: o que não é sigiloso (porta, ambiente, host do banco) fica no
ConfigMap; segredo do JWT, chave interna e senha do banco ficam em Secrets. O
Deployment lê a senha do banco direto do Secret do Postgres (uma fonte só).

**Prometheus descobrindo os pods** (`k8s/observabilidade/prometheus/prometheus.yml`):
em vez de endereço fixo, pergunta à API do Kubernetes quais pods existem — por
isso precisa do `Role` de leitura em `prometheus.yaml`.

```yaml
kubernetes_sd_configs:
  - role: pod
    namespaces: { names: [leiloes] }
relabel_configs:
  - source_labels: [__meta_kubernetes_pod_label_app]   # só os pods do leiloes-service
    regex: leiloes-service
    action: keep
  - source_labels: [__meta_kubernetes_pod_name]        # rótulo "pod" nos gráficos
    target_label: pod
```

**Grafana**: o dashboard do T2 foi reaproveitado e ganhou a linha "Kubernetes"
(pods no ar, requisições por pod, CPU por pod). Datasource e dashboard entram por
ConfigMaps gerados no `kustomization.yaml` (`configMapGenerator`).

**HPA** (`k8s/app/hpa.yaml`): CPU média acima de 70% → cria pods, até 5; nunca menos de 2.

**Kustomize** (`k8s/kustomization.yaml`): lista todos os arquivos e fixa a imagem;
um comando aplica tudo: `kubectl apply -k leiloes-service/k8s`.

## 5. CI/CD (continua o fluxo do T2)

```
feature/* ─► ci (testes, Sonar) ─► k8s (Minikube no runner) ─► imagem (só build)
develop   ─► ci ─► versao ─► k8s ─► imagem (GHCR :dev)   ─► deploy DEV   (Render)
main      ─► ci ─► versao ─► k8s ─► imagem (GHCR :1.2.5) ─► deploy HOMOL (Render)
```

O job `k8s` sobe um Minikube no próprio runner do GitHub, constrói a imagem, aplica os
manifests e roda `ci/testar-k8s.sh`, que confere:
1. pelo menos 2 pods prontos;
2. `/health` respondendo pelo Ingress;
3. cadastro e listagem de um leilão (serviço + banco no cluster);
4. Prometheus coletando de 2+ pods.

Se o Kubernetes falhar, a imagem **não é publicada** e não há deploy.

**Verificado localmente** (21/11/2026, Minikube 1.39): `kubectl apply -k` sobe os
4 Deployments sem reinícios; `ci/testar-k8s.sh` passou nos 4 itens (2 pods prontos,
`/health` na versão `1.2.5` pelo Ingress, leilão cadastrado e listado, Prometheus
coletando de 2 pods); apagando os pods, o Kubernetes recriou os 2 em segundos; o
Prometheus mostra as requisições repartidas entre os pods.

## 6. Como rodar (passo a passo)

**Pré-requisitos** (uma vez só):
- **Docker Desktop** instalado e **aberto** (o Minikube roda dentro dele, como um container);
- **Minikube**: `winget install Kubernetes.minikube` (fica em `C:\Program Files\Kubernetes\Minikube\`);
- **kubectl**: já vem com o Docker Desktop.

**Subir** (na pasta `API-Leiloes`):

```powershell
# terminal 1: liga o Minikube, os addons (ingress e metrics-server),
# aplica todos os manifests e espera os pods ficarem prontos
powershell -ExecutionPolicy Bypass -File .\leiloes-service\k8s\subir.ps1

# terminal 2: publica o Ingress em 127.0.0.1 - DEIXE ABERTO durante a apresentação
minikube tunnel
```

**Acessar** (no navegador). Nomes terminados em `.localhost` apontam sozinhos para o
próprio PC: **não precisa editar o arquivo hosts**.

| O quê | Endereço |
|---|---|
| API (saúde) | http://leiloes.localhost/health |
| Swagger | http://leiloes.localhost/docs |
| Grafana (admin / admin) | http://grafana-leiloes.localhost |
| Prometheus (um alvo por pod) | http://prometheus-leiloes.localhost/targets |

**Se algo der errado:**

| Problema | Solução |
|---|---|
| Reiniciou o PC e nada responde | o Minikube desliga junto: abra o Docker Desktop e rode o `subir.ps1` de novo |
| `minikube` não é reconhecido | feche e abra o terminal (ou use `& "C:\Program Files\Kubernetes\Minikube\minikube.exe"`) |
| "Docker Desktop tem apenas X MB de memória" | `subir.ps1 -Memoria 2500` (o padrão é 3000 MB) |
| Endereços `.localhost` não abrem | confira se o `minikube tunnel` está aberto no outro terminal |
| Sem o tunnel | `kubectl -n leiloes port-forward svc/leiloes-service 3003:3003` → http://localhost:3003 (idem `svc/grafana 3000:3000`) |

**Desligar:** `minikube stop` (os dados ficam). Para apagar tudo do serviço:
`kubectl delete -k leiloes-service/k8s`.

## 7. Roteiro da demonstração (5 minutos)

```powershell
# 0. (antes da aula) seção 6: subir.ps1 + minikube tunnel aberto

# 1. múltiplos pods (requisito 4.2)
kubectl -n leiloes get deployments,pods -o wide

# 2. recursos pedidos
kubectl -n leiloes get configmap,secret,svc,ingress,hpa

# 3. aplicação funcionando pelo Ingress
curl.exe http://leiloes.localhost/health        # ou abrir http://leiloes.localhost/docs

# 4. auto-recuperação: apaga um pod e o Kubernetes cria outro
kubectl -n leiloes delete pod -l app=leiloes-service --wait=false
kubectl -n leiloes get pods -w

# 5. observabilidade: tráfego + Grafana e Prometheus
powershell -ExecutionPolicy Bypass -File .\leiloes-service\observabilidade\gerar-trafego.ps1 -BaseUrl http://leiloes.localhost
#    http://grafana-leiloes.localhost            -> painel "Pods no ar" = 2, requisições por pod
#    http://prometheus-leiloes.localhost/targets -> um alvo por pod

# 6. CI/CD: aba Actions -> leiloes-service -> job "Kubernetes (Minikube)"
```

## 8. Perguntas prováveis

- **Por que o banco tem 1 réplica?** O banco guarda estado e o disco (PVC) é de um pod
  só. Quem precisa de réplicas é o serviço, que não guarda estado e pode ser multiplicado.
- **Duas réplicas rodando a migração ao mesmo tempo dá problema?** Não: o `init.sql` é
  idempotente (`IF NOT EXISTS`) e o `migrar.js` tenta de novo se falhar.
- **E o usuarios-service?** Sem `USUARIOS_SERVICE_URL` o leiloes roda "sozinho" (como
  no deploy isolado do T2). Com o usuarios no cluster, basta preencher a URL no ConfigMap.
- **Secret no Git?** São os valores de desenvolvimento (os mesmos do `.env.example`).
  Num cluster real, o Secret é criado com `kubectl create secret` e não vai para o repositório.
- **Por que `runAsUser: 1000`?** A imagem roda como o usuário `node`; com o número, o
  Kubernetes consegue garantir `runAsNonRoot`.
