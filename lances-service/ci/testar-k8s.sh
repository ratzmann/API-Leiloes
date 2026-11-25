#!/usr/bin/env bash
# =============================================================================
# ci/testar-k8s.sh  -  confere o lances-service rodando no Kubernetes (T3)
# -----------------------------------------------------------------------------
# Teste automatico do cluster local (o T3 nao tem CI/CD): rode depois do subir.ps1,
# com o "minikube tunnel" ligado, no Git Bash:
#   bash lances-service/ci/testar-k8s.sh 127.0.0.1
#
#   1. o Deployment tem pelo menos 2 pods prontos (replicacao);
#   2. GET /health pelo Ingress (host lances.localhost) responde;
#   3. GET /lances responde 200 (servico + banco no cluster);
#   4. lance num leilao que nao existe -> 404 do leiloes-service: prova que a Saga
#      alcanca o outro namespace (sem o leiloes no ar, seria 503);
#   5. o Prometheus do cluster esta coletando de 2+ pods (observabilidade).
# O fluxo completo da Saga (registro, leilao, lances, credito) fica no
# teste integrado: node testes/testar-nuvem.js k8s
#
# Recebe: $1 = IP do Ingress (minikube ip). Opcional: VERSAO_ESPERADA e
# JWT_SECRET (padrao: o do k8s/app/secret.yaml).
# =============================================================================
set -euo pipefail

IP="${1:?informe o IP do Ingress (minikube ip)}"
NS=lances
JWT_SECRET="${JWT_SECRET:-super-segredo-trabalho-microsservicos}"

# curl pelo Ingress: o host decide para qual Service o NGINX encaminha
chamar() { curl -sS --max-time 10 -H "Host: $1" "${@:3}" "http://$IP$2"; }

echo "== 1. Replicas"
PRONTOS=$(kubectl -n "$NS" get deployment lances-service -o jsonpath='{.status.readyReplicas}')
kubectl -n "$NS" get pods -l app=lances-service -o wide
if [ "${PRONTOS:-0}" -lt 2 ]; then
  echo "::error::Esperava 2+ pods prontos do lances-service, achei ${PRONTOS:-0}."
  exit 1
fi
echo "OK: $PRONTOS pods prontos"

echo "== 2. /health pelo Ingress"
SAUDE=""
for _ in $(seq 1 30); do
  SAUDE=$(chamar lances.localhost /health || true)
  echo "$SAUDE" | grep -q '"status":"ok"' && break
  sleep 2
done
echo "$SAUDE"
echo "$SAUDE" | grep -q '"status":"ok"' || { echo "::error::/health nao respondeu pelo Ingress."; exit 1; }
if [ -n "${VERSAO_ESPERADA:-}" ]; then
  echo "$SAUDE" | grep -q "\"versao\":\"$VERSAO_ESPERADA\"" ||
    { echo "::error::Versao no ar diferente de $VERSAO_ESPERADA."; exit 1; }
fi

echo "== 3. Listagem de lances (servico + banco no cluster)"
LISTA=$(chamar lances.localhost /lances -w ' HTTP %{http_code}')
echo "$LISTA" | tail -c 120
echo "$LISTA" | grep -q 'HTTP 200' || { echo "::error::GET /lances falhou."; exit 1; }
echo "OK: banco respondendo"

echo "== 4. Saga alcanca o leiloes-service (outro namespace)"
TOKEN=$(JWT_SECRET="$JWT_SECRET" node -e '
  const c = require("crypto");
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b({ alg: "HS256", typ: "JWT" }) + "." +
    b({ sub: 4242, papel: "LICITANTE", perfilId: 4242, iss: "sistema-leilao-auth", iat: agora, exp: agora + 600 });
  const assinatura = c.createHmac("sha256", process.env.JWT_SECRET).update(corpo).digest("base64url");
  console.log(corpo + "." + assinatura);')
LANCE=$(chamar lances.localhost /lances -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -w ' HTTP %{http_code}' \
  -d '{"leilaoId":999999999,"valor":1000}')
echo "$LANCE"
echo "$LANCE" | grep -q 'HTTP 404' ||
  { echo "::error::Esperava 404 do leiloes-service (503 = leiloes fora do ar ou URL errada)."; exit 1; }
echo "OK: lances -> leiloes pelo DNS do cluster"

echo "== 5. Prometheus coletando de cada pod"
PODS=0
for _ in $(seq 1 30); do
  RESPOSTA=$(chamar prometheus-lances.localhost /api/v1/query -G \
    --data-urlencode 'query=count(timestamp(up{job="lances-service"} == 1) > time() - 30)' || true)
  PODS=$(echo "$RESPOSTA" | sed -n 's/.*"value":\[[^,]*,"\([0-9]*\)"\].*/\1/p')
  [ "${PODS:-0}" -ge 2 ] && break
  sleep 5
done
[ "${PODS:-0}" -ge 2 ] || { echo "::error::Prometheus ve ${PODS:-0} pods (esperado 2+)."; exit 1; }
echo "OK: Prometheus coletando de $PODS pods"

echo "== Grafana"
chamar grafana-lances.localhost /api/health
echo
echo "Tudo certo no Kubernetes."
