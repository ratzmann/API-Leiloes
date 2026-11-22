#!/usr/bin/env bash
# =============================================================================
# ci/testar-k8s.sh  -  confere o usuarios-service rodando no Kubernetes (T3)
# -----------------------------------------------------------------------------
# Teste automatico do cluster local (o T3 nao tem CI/CD): rode depois do subir.ps1,
# com o "minikube tunnel" ligado, no Git Bash:
#   bash usuarios-service/ci/testar-k8s.sh 127.0.0.1
#
#   1. o Deployment tem pelo menos 2 pods prontos (replicacao);
#   2. GET /health pelo Ingress (host usuarios.localhost) responde;
#   3. rota interna: sem a chave -> 403; com a chave -> leiloeiro cadastrado
#      (servico + banco no cluster); o dono ve os dados pessoais (token assinado);
#   4. o Prometheus do cluster esta coletando de 2+ pods (observabilidade).
#
# Recebe: $1 = IP do Ingress (minikube ip). Opcional: VERSAO_ESPERADA, JWT_SECRET
# e CHAVE_INTERNA (padrao: os do k8s/app/secret.yaml).
# =============================================================================
set -euo pipefail

IP="${1:?informe o IP do Ingress (minikube ip)}"
NS=usuarios
JWT_SECRET="${JWT_SECRET:-super-segredo-trabalho-microsservicos}"
CHAVE_INTERNA="${CHAVE_INTERNA:-chave-interna-trabalho-microsservicos}"

# curl pelo Ingress: o host decide para qual Service o NGINX encaminha
chamar() { curl -sS --max-time 10 -H "Host: $1" "${@:3}" "http://$IP$2"; }

echo "== 1. Replicas"
PRONTOS=$(kubectl -n "$NS" get deployment usuarios-service -o jsonpath='{.status.readyReplicas}')
kubectl -n "$NS" get pods -l app=usuarios-service -o wide
if [ "${PRONTOS:-0}" -lt 2 ]; then
  echo "::error::Esperava 2+ pods prontos do usuarios-service, achei ${PRONTOS:-0}."
  exit 1
fi
echo "OK: $PRONTOS pods prontos"

echo "== 2. /health pelo Ingress"
SAUDE=""
for _ in $(seq 1 30); do
  SAUDE=$(chamar usuarios.localhost /health || true)
  echo "$SAUDE" | grep -q '"status":"ok"' && break
  sleep 2
done
echo "$SAUDE"
echo "$SAUDE" | grep -q '"status":"ok"' || { echo "::error::/health nao respondeu pelo Ingress."; exit 1; }
if [ -n "${VERSAO_ESPERADA:-}" ]; then
  echo "$SAUDE" | grep -q "\"versao\":\"$VERSAO_ESPERADA\"" ||
    { echo "::error::Versao no ar diferente de $VERSAO_ESPERADA."; exit 1; }
fi

echo "== 3. Cadastro de leiloeiro (rota interna + banco no cluster)"
SUFIXO=$(date +%s)
CORPO="{\"usuarioId\":$SUFIXO,\"nome\":\"Leiloeiro k8s\",\"email\":\"k8s$SUFIXO@teste.com\",\"registroProfissional\":\"KUBE-${SUFIXO: -6}\"}"

SEM_CHAVE=$(chamar usuarios.localhost /leiloeiros -X POST -H "Content-Type: application/json" \
  -o /dev/null -w '%{http_code}' -d "$CORPO")
echo "sem a chave interna: HTTP $SEM_CHAVE"
[ "$SEM_CHAVE" = "403" ] || { echo "::error::Rota interna aceitou chamada sem a chave (HTTP $SEM_CHAVE)."; exit 1; }

CRIADO=$(chamar usuarios.localhost /leiloeiros -X POST -H "Content-Type: application/json" \
  -H "X-Chave-Interna: $CHAVE_INTERNA" -w ' HTTP %{http_code}' -d "$CORPO")
echo "$CRIADO"
echo "$CRIADO" | grep -q 'HTTP 201' || { echo "::error::Cadastro de leiloeiro falhou."; exit 1; }
ID=$(echo "${CRIADO% HTTP *}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

# token assinado com o mesmo JWT_SECRET/JWT_ISSUER do auth-service, em nome do leiloeiro
TOKEN=$(JWT_SECRET="$JWT_SECRET" PERFIL="$ID" node -e '
  const c = require("crypto");
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const perfil = Number(process.env.PERFIL);
  const corpo = b({ alg: "HS256", typ: "JWT" }) + "." +
    b({ sub: perfil, papel: "LEILOEIRO", perfilId: perfil, iss: "sistema-leilao-auth", iat: agora, exp: agora + 600 });
  const assinatura = c.createHmac("sha256", process.env.JWT_SECRET).update(corpo).digest("base64url");
  console.log(corpo + "." + assinatura);')
# LGPD: o dono ve o e-mail; sem token so os campos publicos
chamar usuarios.localhost "/leiloeiros/$ID" -H "Authorization: Bearer $TOKEN" | grep -q "k8s$SUFIXO@teste.com" ||
  { echo "::error::O dono nao recebeu os proprios dados (token conferido no servico?)."; exit 1; }
chamar usuarios.localhost "/leiloeiros/$ID" | grep -q "k8s$SUFIXO@teste.com" &&
  { echo "::error::Dados pessoais expostos sem token."; exit 1; }
echo "OK: leiloeiro $ID cadastrado; dono ve o e-mail, anonimo nao"

echo "== 4. Prometheus coletando de cada pod"
PODS=0
for _ in $(seq 1 30); do
  RESPOSTA=$(chamar prometheus-usuarios.localhost /api/v1/query -G \
    --data-urlencode 'query=count(up{job="usuarios-service"} == 1)' || true)
  PODS=$(echo "$RESPOSTA" | sed -n 's/.*"value":\[[^,]*,"\([0-9]*\)"\].*/\1/p')
  [ "${PODS:-0}" -ge 2 ] && break
  sleep 5
done
[ "${PODS:-0}" -ge 2 ] || { echo "::error::Prometheus ve ${PODS:-0} pods (esperado 2+)."; exit 1; }
echo "OK: Prometheus coletando de $PODS pods"

echo "== Grafana"
chamar grafana-usuarios.localhost /api/health
echo
echo "Tudo certo no Kubernetes."
