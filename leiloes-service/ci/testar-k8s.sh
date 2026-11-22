#!/usr/bin/env bash
# =============================================================================
# ci/testar-k8s.sh  -  confere o leiloes-service rodando no Kubernetes (T3)
# -----------------------------------------------------------------------------
# Usado pelo job "k8s" do pipeline, depois do kubectl apply -k. Tambem roda na
# maquina local (com "minikube tunnel" ligado):  bash ci/testar-k8s.sh 127.0.0.1
#
#   1. o Deployment tem pelo menos 2 pods prontos (replicacao);
#   2. GET /health pelo Ingress (host leiloes.localhost) responde;
#   3. cadastra um leilao com token de LEILOEIRO e lista de volta (banco no cluster);
#   4. o Prometheus do cluster esta coletando de 2+ pods (observabilidade).
#
# Recebe: $1 = IP do Ingress (minikube ip). Opcional: VERSAO_ESPERADA e
# JWT_SECRET (padrao: o do k8s/app/secret.yaml).
# =============================================================================
set -euo pipefail

IP="${1:?informe o IP do Ingress (minikube ip)}"
NS=leiloes
JWT_SECRET="${JWT_SECRET:-super-segredo-trabalho-microsservicos}"

# curl pelo Ingress: o host decide para qual Service o NGINX encaminha
chamar() { curl -sS --max-time 10 -H "Host: $1" "${@:3}" "http://$IP$2"; }

echo "== 1. Replicas"
PRONTOS=$(kubectl -n "$NS" get deployment leiloes-service -o jsonpath='{.status.readyReplicas}')
kubectl -n "$NS" get pods -l app=leiloes-service -o wide
if [ "${PRONTOS:-0}" -lt 2 ]; then
  echo "::error::Esperava 2+ pods prontos do leiloes-service, achei ${PRONTOS:-0}."
  exit 1
fi
echo "OK: $PRONTOS pods prontos"

echo "== 2. /health pelo Ingress"
SAUDE=""
for _ in $(seq 1 30); do
  SAUDE=$(chamar leiloes.localhost /health || true)
  echo "$SAUDE" | grep -q '"status":"ok"' && break
  sleep 2
done
echo "$SAUDE"
echo "$SAUDE" | grep -q '"status":"ok"' || { echo "::error::/health nao respondeu pelo Ingress."; exit 1; }
if [ -n "${VERSAO_ESPERADA:-}" ]; then
  echo "$SAUDE" | grep -q "\"versao\":\"$VERSAO_ESPERADA\"" ||
    { echo "::error::Versao no ar diferente de $VERSAO_ESPERADA."; exit 1; }
fi

echo "== 3. Cadastro de leilao (servico + banco no cluster)"
TOKEN=$(JWT_SECRET="$JWT_SECRET" node -e '
  const c = require("crypto");
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b({ alg: "HS256", typ: "JWT" }) + "." +
    b({ sub: 4242, papel: "LEILOEIRO", perfilId: 4242, iss: "sistema-leilao-auth", iat: agora, exp: agora + 600 });
  const assinatura = c.createHmac("sha256", process.env.JWT_SECRET).update(corpo).digest("base64url");
  console.log(corpo + "." + assinatura);')
INICIO=$(date -u -d '+1 day' +%FT%TZ)
FIM=$(date -u -d '+2 day' +%FT%TZ)
CRIADO=$(chamar leiloes.localhost /leiloes -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -w ' HTTP %{http_code}' \
  -d "{\"titulo\":\"Teste k8s\",\"raca\":\"Nelore\",\"quantidadeBois\":10,\"lanceInicial\":1000,\"incrementoMinimo\":50,\"dataInicio\":\"$INICIO\",\"dataFim\":\"$FIM\"}")
echo "$CRIADO"
echo "$CRIADO" | grep -q 'HTTP 201' || { echo "::error::Cadastro de leilao falhou."; exit 1; }
chamar leiloes.localhost /leiloes | grep -q 'Teste k8s' || { echo "::error::Leilao nao aparece na listagem."; exit 1; }
echo "OK: leilao cadastrado e listado"

echo "== 4. Prometheus coletando de cada pod"
PODS=0
for _ in $(seq 1 30); do
  RESPOSTA=$(chamar prometheus.localhost /api/v1/query -G \
    --data-urlencode 'query=count(timestamp(up{job="leiloes-service"} == 1) > time() - 30)' || true)
  PODS=$(echo "$RESPOSTA" | sed -n 's/.*"value":\[[^,]*,"\([0-9]*\)"\].*/\1/p')
  [ "${PODS:-0}" -ge 2 ] && break
  sleep 5
done
[ "${PODS:-0}" -ge 2 ] || { echo "::error::Prometheus ve ${PODS:-0} pods (esperado 2+)."; exit 1; }
echo "OK: Prometheus coletando de $PODS pods"

echo "== Grafana"
chamar grafana.localhost /api/health
echo
echo "Tudo certo no Kubernetes."
