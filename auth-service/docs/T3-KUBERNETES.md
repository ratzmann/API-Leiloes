# T3 — `auth-service` no Kubernetes (resumo para a apresentação)

> O que foi feito, como funciona e como mostrar. Instruções completas de execução:
> [`k8s/README.md`](../k8s/README.md). Mesmo padrão do `leiloes-service/k8s` (equipe).

## 1. Em uma frase

A **mesma imagem** que o pipeline do T2 publica no GHCR agora roda num cluster
**Minikube**, com **2 réplicas**, banco próprio, configuração por **ConfigMap/Secret**,
acesso por **Ingress**, **HPA** para escalar e **Prometheus + Grafana dentro do cluster**.
No registro, o auth conversa com o **usuarios-service em outro namespace** do mesmo
cluster. O pipeline ganhou um job que sobe um Minikube com os dois serviços e testa o
registro de ponta a ponta antes de publicar a imagem.

## 2. Requisitos × o que foi feito

| Requisito do T3 | Como cumprimos | Arquivo |
|---|---|---|
| 1. Aplicação funcionando no cluster | serviço + Postgres no namespace `auth`; registro (credencial aqui, perfil no usuarios), login e token aceito pelo usuarios, testados pelo Ingress | `k8s/app/`, `k8s/banco/` |
| 2. Minikube | cluster local com os addons `ingress` e `metrics-server` | `k8s/subir.ps1` |
| 3. Deployment, Service, ConfigMap, Secret, Ingress | um arquivo de cada para o serviço (e para o banco) | `k8s/app/*.yaml` |
| 4. ConfigMap / Secret / sem configuração fixa | o código já lia tudo de variáveis de ambiente (T2); o ConfigMap e o Secret entram com `envFrom` | `k8s/app/configmap.yaml`, `secret.yaml` |
| 4.1 Mínimo de 2 réplicas | `replicas: 2` + HPA com `minReplicas: 2` (até 5) | `k8s/app/deployment.yaml`, `hpa.yaml` |
| 4.2 Evidência de vários pods | `kubectl get pods`, alvos do Prometheus (um por pod) e painel "Pods no ar" no Grafana | seção 6 (roteiro) |
| 5. Prometheus e Grafana no cluster | Prometheus descobre os pods sozinho; Grafana já sobe com o dashboard | `k8s/observabilidade/` |
| 6. Roda localmente | `subir.ps1` sobe o usuarios e o auth com um comando | `k8s/subir.ps1` |
| 7. Diretório `k8s/` + README | pasta `auth-service/k8s/` com README de execução | `k8s/README.md` |
| (objetivo) Manter CI/CD | job `k8s` no workflow: Minikube no runner, `kubectl apply -k` (usuarios + auth) e testes; só depois publica a imagem | `.github/workflows/auth-service.yml`, `ci/testar-k8s.sh` |

**Mudança de código: nenhuma.** O T2 já tinha deixado tudo configurável por ambiente
(`src/config/`, `utils/jwt.js`, `clients/`), então o T3 é só infraestrutura. A versão
subiu para **1.1.3** (patch), porque a `main` não publica duas vezes a mesma versão.
O `observabilidade/gerar-trafego.ps1` passou a mandar `dadosPerfil` válidos, para os
registros darem `201` também quando o auth está ligado ao usuarios (cluster, compose da raiz).

## 3. Como funciona (desenho)

```
  navegador / curl
       |  auth.localhost | grafana-auth.localhost | prometheus-auth.localhost
       v
 +----------------------------------------------+
 |      Ingress (NGINX, addon do Minikube)      |
 +----------------------------------------------+
       |                         |         |
       v                         v         v
 +---------------------------+  Grafana  Prometheus (coleta /metrics de cada pod)
 | Service auth-service      |
 | (reparte entre os pods)   |
 +---------------------------+
       |               |
       v               v
 +-----------+   +-----------+     POST /leiloeiros|/licitantes + X-Chave-Interna
 |   pod 1   |   |   pod 2   |  ------------------------------------------------+
 +-----------+   +-----------+                                                  |
       |               |                                                        v
       v               v                              usuarios-service.usuarios.svc.cluster.local:3002
 +---------------------------+                        (namespace usuarios: 2 pods + usuarios-db)
 | Service auth-db           |---> Postgres (1 réplica) + PVC de 1 GiB
 +---------------------------+

 ConfigMap + Secret -> variáveis de ambiente dos pods      namespace: auth
```

## 4. Os trechos que importam

- **Deployment** (`k8s/app/deployment.yaml`): 2 réplicas, `envFrom` do ConfigMap e do
  Secret, sondas `startup`/`readiness`/`liveness` no `/health`, `requests`/`limits`,
  `runAsNonRoot`. Usuário e senha do banco vêm do Secret do Postgres (uma fonte só).
- **initContainer `esperar-banco`**: `pg_isready` até o Postgres aceitar conexões.
- **Comunicação entre namespaces** (`k8s/app/configmap.yaml`):

  ```yaml
  USUARIOS_SERVICE_URL: "http://usuarios-service.usuarios.svc.cluster.local:3002"
  ```

  O DNS do cluster resolve `<service>.<namespace>.svc.cluster.local`. Se o usuarios não
  responder, a **compensação** do registro apaga a credencial e responde `503` (T1).
  Vazio, o auth roda sozinho como no T2 (perfil `null`).
- **Segredos compartilhados**: `JWT_SECRET` (assina os tokens) e `CHAVE_INTERNA` ficam no
  Secret e precisam ser iguais nos 4 serviços; o teste confere que o usuarios aceita o
  token emitido aqui.
- **Prometheus** (`k8s/observabilidade/prometheus/prometheus.yml`): `kubernetes_sd_configs`
  com `role: pod` no namespace `auth`; o rótulo `pod` diferencia as réplicas.
- **Grafana**: o dashboard do T2 ganhou a linha "Kubernetes" (pods no ar, requisições
  por pod, CPU por pod).
- **HPA**: CPU média acima de 70% → cria pods, até 5; nunca menos de 2. O auth é o serviço
  que mais usa CPU (bcrypt no registro e no login), então é o que mais escala sob carga.
- **Pedidos de CPU menores no banco, Prometheus e Grafana (50m)**: com os 4 serviços no
  mesmo Minikube de 2 CPUs, a soma dos `requests` precisa caber no nó.

## 5. CI/CD (continua o fluxo do T2)

```
feature/* ─► ci (testes, Sonar) ─► k8s (Minikube no runner) ─► imagem (só build)
develop   ─► ci ─► versao ─► k8s ─► imagem (GHCR :dev)   ─► deploy DEV   (Render)
main      ─► ci ─► versao ─► k8s ─► imagem (GHCR :1.1.3) ─► deploy HOMOL (Render)
```

O job `k8s` constrói as imagens do auth **e do usuarios**, aplica os dois `k8s/` e roda
`ci/testar-k8s.sh`, que confere:
1. pelo menos 2 pods prontos do auth;
2. `/health` respondendo pelo Ingress, na versão recém-construída;
3. registro de um leiloeiro com perfil criado no usuarios (outro namespace), login `200`,
   senha errada `401` e o usuarios aceitando o token do auth;
4. Prometheus coletando de 2+ pods.

Se o Kubernetes falhar, a imagem **não é publicada** e não há deploy.

## 6. Roteiro da demonstração (5 minutos)

```powershell
# 0. (antes da aula) auth-service\k8s\subir.ps1 (sobe usuarios + auth)
#    + "minikube tunnel" aberto em outro terminal

# 1. múltiplos pods (requisito 4.2), nos dois namespaces
kubectl -n auth get deployments,pods -o wide
kubectl -n usuarios get pods

# 2. recursos pedidos
kubectl -n auth get configmap,secret,svc,ingress,hpa

# 3. aplicação funcionando: registro atravessando os namespaces
Invoke-RestMethod -Method Post http://auth.localhost/registrar -ContentType application/json -Body '{"nome":"Leiloeiro Demo","email":"demo1@teste.com","senha":"senha123","papel":"LEILOEIRO","dadosPerfil":{"registroProfissional":"DEMO-0001"}}'
#    -> a resposta traz "perfil" (criado no usuarios-service) e "token"

# 4. auto-recuperação: apaga os pods e o Kubernetes cria outros
kubectl -n auth delete pod -l app=auth-service --wait=false
kubectl -n auth get pods -w

# 5. observabilidade: tráfego + Grafana e Prometheus
powershell -ExecutionPolicy Bypass -File .\auth-service\observabilidade\gerar-trafego.ps1 -BaseUrl http://auth.localhost
#    http://grafana-auth.localhost            -> "Pods no ar" = 2, requisições por pod
#    http://prometheus-auth.localhost/targets -> um alvo por pod

# 6. CI/CD: aba Actions -> auth-service -> job "Kubernetes (Minikube)"
```

## 7. Perguntas prováveis

- **Por que o banco tem 1 réplica?** O banco guarda estado e o disco (PVC) é de um pod
  só. Quem precisa de réplicas é o serviço, que não guarda estado.
- **O token gerado num pod vale no outro?** Sim: o JWT é assinado com o `JWT_SECRET` do
  Secret, igual em todas as réplicas; nenhuma sessão fica guardada na memória do pod.
- **Por que namespaces separados para auth e usuarios?** Cada microsserviço é independente
  (próprio banco, próprios manifests, próprio Prometheus/Grafana); a conversa entre eles é
  só REST pelo DNS do cluster, como era pela rede do Docker no T1.
- **Secret no Git?** São os valores de desenvolvimento (os mesmos do docker-compose).
  Num cluster real, o Secret é criado com `kubectl create secret` e não vai para o repositório.
