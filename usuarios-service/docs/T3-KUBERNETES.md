# T3 — `usuarios-service` no Kubernetes (resumo para a apresentação)

> O que foi feito, como funciona e como mostrar. Instruções completas de execução:
> [`k8s/README.md`](../k8s/README.md). Mesmo padrão do `leiloes-service/k8s` (equipe).

## 1. Em uma frase

A **mesma imagem** que o pipeline do T2 publica no GHCR agora roda num cluster
**Minikube**, com **2 réplicas**, banco próprio, configuração por **ConfigMap/Secret**,
acesso por **Ingress**, **HPA** para escalar e **Prometheus + Grafana dentro do cluster**.
Um script (`ci/testar-k8s.sh`) testa o cluster de ponta a ponta.

## 2. Requisitos × o que foi feito

| Requisito do T3 | Como cumprimos | Arquivo |
|---|---|---|
| 1. Aplicação funcionando no cluster | serviço + Postgres no namespace `usuarios`; cadastro pela rota interna e leitura com token testados pelo Ingress; o auth (namespace `auth`) cria perfis aqui | `k8s/app/`, `k8s/banco/` |
| 2. Minikube | cluster local com os addons `ingress` e `metrics-server` | `k8s/subir.ps1` |
| 3. Deployment, Service, ConfigMap, Secret, Ingress | um arquivo de cada para o serviço (e para o banco) | `k8s/app/*.yaml` |
| 4. ConfigMap / Secret / sem configuração fixa | o código já lia tudo de variáveis de ambiente (T2); o ConfigMap e o Secret entram com `envFrom` | `k8s/app/configmap.yaml`, `secret.yaml` |
| 4.1 Mínimo de 2 réplicas | `replicas: 2` + HPA com `minReplicas: 2` (até 5) | `k8s/app/deployment.yaml`, `hpa.yaml` |
| 4.2 Evidência de vários pods | `kubectl get pods`, alvos do Prometheus (um por pod) e painel "Pods no ar" no Grafana | seção 6 (roteiro) |
| 5. Prometheus e Grafana no cluster | Prometheus descobre os pods sozinho; Grafana já sobe com o dashboard | `k8s/observabilidade/` |
| 6. Roda localmente | `subir.ps1` sobe tudo com um comando | `k8s/subir.ps1` |
| 7. Diretório `k8s/` + README | pasta `usuarios-service/k8s/` com README de execução | `k8s/README.md` |
| Teste do cluster (extra) | script que confere réplicas, rota interna, LGPD e Prometheus | `ci/testar-k8s.sh` |

**Mudança de código: nenhuma.** O T2 já tinha deixado tudo configurável por ambiente
(`src/config/ambiente.js`, `src/config/db.js`, `middlewares/`), então o T3 é só
infraestrutura. A versão subiu para **1.1.3** (patch), porque a `main` não publica duas
vezes a mesma versão.

## 3. Como funciona (desenho)

```
  navegador / curl                         auth-service (namespace auth)
       |  usuarios.localhost | grafana-usuarios.localhost | prometheus-usuarios.localhost
       v                                          |  POST /leiloeiros|/licitantes
 +----------------------------------------------+ |  + X-Chave-Interna
 |      Ingress (NGINX, addon do Minikube)      | |  usuarios-service.usuarios.svc.cluster.local:3002
 +----------------------------------------------+ |
       |                         |         |      |
       v                         v         v      v
 +---------------------------+  Grafana  Prometheus
 | Service usuarios-service  |<------------------+
 | (reparte entre os pods)   |
 +---------------------------+
       |               |          ^ Prometheus coleta /metrics de cada pod
       v               v          |
 +-----------+   +-----------+ ---+
 |   pod 1   |   |   pod 2   |
 +-----------+   +-----------+
       |               |
       v               v
 +---------------------------+
 | Service usuarios-db       |---> Postgres (1 réplica) + PVC de 1 GiB
 +---------------------------+

 ConfigMap + Secret -> variáveis de ambiente dos pods      namespace: usuarios
```

## 4. Os trechos que importam

- **Deployment** (`k8s/app/deployment.yaml`): 2 réplicas, `envFrom` do ConfigMap e do
  Secret, sondas `startup`/`readiness`/`liveness` no `/health`, `requests`/`limits`,
  `runAsNonRoot`. Usuário e senha do banco vêm do Secret do Postgres (uma fonte só).
- **initContainer `esperar-banco`**: `pg_isready` até o Postgres aceitar conexões; sem ele,
  os pods reiniciavam enquanto o banco subia.
- **ConfigMap × Secret**: porta, ambiente, host do banco e `JWT_ISSUER` no ConfigMap;
  `JWT_SECRET`, `CHAVE_INTERNA` e senha do banco em Secrets.
- **Rotas internas sem Kong**: no cluster não há Kong na frente, mas o serviço já exige a
  `CHAVE_INTERNA` (header `X-Chave-Interna`) nas rotas internas e confere a assinatura do
  token sozinho — as mesmas proteções do deploy no Render (T2).
- **Prometheus** (`k8s/observabilidade/prometheus/prometheus.yml`): `kubernetes_sd_configs`
  com `role: pod` no namespace `usuarios`; o rótulo `pod` diferencia as réplicas. O `Role`
  de leitura em `prometheus.yaml` dá a permissão de listar os pods.
- **Grafana**: o dashboard do T2 ganhou a linha "Kubernetes" (pods no ar, requisições
  por pod, CPU por pod); datasource e dashboard entram por ConfigMaps do `kustomization.yaml`.
- **HPA**: CPU média acima de 70% → cria pods, até 5; nunca menos de 2.
- **Pedidos de CPU menores no banco, Prometheus e Grafana (50m)**: com os 4 serviços no
  mesmo Minikube de 2 CPUs, a soma dos `requests` precisa caber no nó.

## 5. Teste automático do cluster

O T3 não pede CI/CD (combinado em sala): o cluster roda só na máquina local. O pipeline
do T2 continua igual e é ele que publica no GHCR a imagem `1.1.3` usada aqui.

Com o `subir.ps1` rodado e o `minikube tunnel` ligado, `bash usuarios-service/ci/testar-k8s.sh 127.0.0.1`
(Git Bash) confere:
1. pelo menos 2 pods prontos;
2. `/health` respondendo pelo Ingress, na versão recém-construída;
3. rota interna sem a chave → `403`; com a chave → leiloeiro cadastrado (serviço + banco);
   o dono (token assinado) vê o e-mail e quem não tem token não vê (LGPD);
4. Prometheus coletando de 2+ pods.

**Verificado localmente** (22/11/2026, Minikube 1.39, `subir.ps1 -ImagemLocal`): todos os Deployments ficaram prontos sem reinícios, e o `testar-k8s.sh` passou nos 4 itens (2 pods, `/health` na `1.1.3` pelo Ingress, rota interna `403`/`201`, LGPD, Prometheus coletando de cada pod).
Os scripts de tráfego funcionaram pelo Ingress e as requisições ficaram repartidas entre
os 2 pods (82 × 72). Apagando os pods, o Kubernetes recriou os 2 em ~3 s. Os dashboards
foram provisionados no Grafana, que lê o Prometheus.

## 6. Roteiro da demonstração (5 minutos)

```powershell
# 0. (antes da aula) subir.ps1 + "minikube tunnel" aberto em outro terminal
#    (ou o auth-service\k8s\subir.ps1, que sobe o usuarios e o auth juntos)

# 1. múltiplos pods (requisito 4.2)
kubectl -n usuarios get deployments,pods -o wide

# 2. recursos pedidos
kubectl -n usuarios get configmap,secret,svc,ingress,hpa

# 3. aplicação funcionando pelo Ingress
curl.exe http://usuarios.localhost/health        # ou abrir http://usuarios.localhost/docs

# 4. auto-recuperação: apaga os pods e o Kubernetes cria outros
kubectl -n usuarios delete pod -l app=usuarios-service --wait=false
kubectl -n usuarios get pods -w

# 5. observabilidade: tráfego + Grafana e Prometheus
powershell -ExecutionPolicy Bypass -File .\usuarios-service\observabilidade\gerar-trafego.ps1 -BaseUrl http://usuarios.localhost
#    http://grafana-usuarios.localhost            -> "Pods no ar" = 2, requisições por pod
#    http://prometheus-usuarios.localhost/targets -> um alvo por pod

# 6. teste automático (seção 5)
bash usuarios-service/ci/testar-k8s.sh 127.0.0.1
```

## 7. Perguntas prováveis

- **Por que o banco tem 1 réplica?** O banco guarda estado e o disco (PVC) é de um pod
  só. Quem precisa de réplicas é o serviço, que não guarda estado.
- **Duas réplicas reservando crédito ao mesmo tempo dá problema?** Não: a reserva é
  decidida no banco (transação com bloqueio da linha do licitante), não na memória do pod,
  então qualquer réplica pode atender.
- **Duas réplicas rodando a migração ao mesmo tempo?** O `init.sql` é idempotente
  (`IF NOT EXISTS`) e o `migrar.js` tenta de novo se falhar.
- **Como o auth acha este serviço em outro namespace?** Pelo DNS do cluster:
  `usuarios-service.usuarios.svc.cluster.local:3002`.
- **Secret no Git?** São os valores de desenvolvimento (os mesmos do docker-compose).
  Num cluster real, o Secret é criado com `kubectl create secret` e não vai para o repositório.
