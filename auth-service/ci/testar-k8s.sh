#!/usr/bin/env bash
# =============================================================================
# ci/testar-k8s.sh  -  confere o auth-service rodando no Kubernetes (T3)
# -----------------------------------------------------------------------------
# Teste automatico do cluster local (o T3 nao tem CI/CD): rode depois do subir.ps1
# (que aplica o usuarios e o auth), com o "minikube tunnel" ligado, no Git Bash:
#   bash auth-service/ci/testar-k8s.sh 127.0.0.1
#
#   1. o Deployment tem pelo menos 2 pods prontos (replicacao);
#   2. GET /health pelo Ingress (host auth.localhost) responde;
#   3. registro de um leiloeiro: o auth grava a credencial no PROPRIO banco e cria o
#      perfil no usuarios-service, em OUTRO namespace (comunicacao entre servicos
#      dentro do cluster); login devolve token; o usuarios aceita esse token;
#   4. o Prometheus do cluster esta coletando de 2+ pods (observabilidade).
#
# Recebe: $1 = IP do Ingress (minikube ip). Opcional: VERSAO_ESPERADA.
# =============================================================================
set -euo pipefail

IP="${1:?informe o IP do Ingress (minikube ip)}"
NS=auth

# curl pelo Ingress: o host decide para qual Service o NGINX encaminha
chamar() { curl -sS --max-time 10 -H "Host: $1" "${@:3}" "http://$IP$2"; }
# le um campo de um JSON (ex.: campo perfil.id) com o node do runner
campo() { node -pe "const j = JSON.parse(require('fs').readFileSync(0)); j.$1"; }

echo "== 1. Replicas"
PRONTOS=$(kubectl -n "$NS" get deployment auth-service -o jsonpath='{.status.readyReplicas}')
kubectl -n "$NS" get pods -l app=auth-service -o wide
if [ "${PRONTOS:-0}" -lt 2 ]; then
  echo "::error::Esperava 2+ pods prontos do auth-service, achei ${PRONTOS:-0}."
  exit 1
fi
echo "OK: $PRONTOS pods prontos"

echo "== 2. /health pelo Ingress"
SAUDE=""
for _ in $(seq 1 30); do
  SAUDE=$(chamar auth.localhost /health || true)
  echo "$SAUDE" | grep -q '"status":"ok"' && break
  sleep 2
done
echo "$SAUDE"
echo "$SAUDE" | grep -q '"status":"ok"' || { echo "::error::/health nao respondeu pelo Ingress."; exit 1; }
if [ -n "${VERSAO_ESPERADA:-}" ]; then
  echo "$SAUDE" | grep -q "\"versao\":\"$VERSAO_ESPERADA\"" ||
    { echo "::error::Versao no ar diferente de $VERSAO_ESPERADA."; exit 1; }
fi

echo "== 3. Registro (auth -> usuarios no cluster) e login"
SUFIXO=$(date +%s)
EMAIL="k8s$SUFIXO@teste.com"
REGISTRO=$(chamar auth.localhost /registrar -X POST -H "Content-Type: application/json" -w ' HTTP %{http_code}' \
  -d "{\"nome\":\"Leiloeiro k8s\",\"email\":\"$EMAIL\",\"senha\":\"senha123\",\"papel\":\"LEILOEIRO\",\"dadosPerfil\":{\"registroProfissional\":\"KUBE-${SUFIXO: -6}\"}}")
echo "$REGISTRO"
echo "$REGISTRO" | grep -q 'HTTP 201' || { echo "::error::Registro falhou."; exit 1; }
PERFIL=$(echo "${REGISTRO% HTTP *}" | campo 'perfil?.id')
[ "$PERFIL" != "null" ] && [ "$PERFIL" != "undefined" ] ||
  { echo "::error::Registro sem perfil: o auth nao alcancou o usuarios-service."; exit 1; }
echo "OK: credencial no auth-db e perfil $PERFIL criado no usuarios-service"

LOGIN=$(chamar auth.localhost /login -X POST -H "Content-Type: application/json" -w ' HTTP %{http_code}' \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"senha123\"}")
echo "$LOGIN" | grep -q 'HTTP 200' || { echo "$LOGIN"; echo "::error::Login falhou."; exit 1; }
TOKEN=$(echo "${LOGIN% HTTP *}" | campo token)
SENHA_ERRADA=$(chamar auth.localhost /login -X POST -H "Content-Type: application/json" -o /dev/null -w '%{http_code}' \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"errada\"}")
[ "$SENHA_ERRADA" = "401" ] || { echo "::error::Senha errada deveria dar 401 (deu $SENHA_ERRADA)."; exit 1; }
echo "OK: login 200 (token) e senha errada 401"

# o usuarios confere a assinatura do token emitido pelo auth (mesmo JWT_SECRET)
chamar usuarios.localhost "/leiloeiros/$PERFIL" -H "Authorization: Bearer $TOKEN" | grep -q "$EMAIL" ||
  { echo "::error::O usuarios-service nao aceitou o token do auth (JWT_SECRET/JWT_ISSUER iguais?)."; exit 1; }
echo "OK: o usuarios-service aceitou o token e devolveu o perfil completo ao dono"

echo "== 4. Prometheus coletando de cada pod"
PODS=0
for _ in $(seq 1 30); do
  RESPOSTA=$(chamar prometheus-auth.localhost /api/v1/query -G \
    --data-urlencode 'query=count(up{job="auth-service"} == 1)' || true)
  PODS=$(echo "$RESPOSTA" | sed -n 's/.*"value":\[[^,]*,"\([0-9]*\)"\].*/\1/p')
  [ "${PODS:-0}" -ge 2 ] && break
  sleep 5
done
[ "${PODS:-0}" -ge 2 ] || { echo "::error::Prometheus ve ${PODS:-0} pods (esperado 2+)."; exit 1; }
echo "OK: Prometheus coletando de $PODS pods"

echo "== Grafana"
chamar grafana-auth.localhost /api/health
echo
echo "Tudo certo no Kubernetes."
