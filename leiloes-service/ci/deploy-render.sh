#!/usr/bin/env bash
# Dispara o deploy da imagem no Render e espera a versao nova responder no /health.
# Variaveis: RENDER_DEPLOY_HOOK_URL (secret), RENDER_URL, IMAGEM, VERSAO_ESPERADA.
# Opcionais (usadas nos testes): TENTATIVAS (padrao 60), ESPERA_S (padrao 10).
set -euo pipefail
: "${IMAGEM:?IMAGEM nao informada}" "${VERSAO_ESPERADA:?VERSAO_ESPERADA nao informada}"
TENTATIVAS="${TENTATIVAS:-60}"
ESPERA_S="${ESPERA_S:-10}"

if [ -z "${RENDER_DEPLOY_HOOK_URL:-}" ]; then
  echo "::warning::Secret RENDER_DEPLOY_HOOK_URL nao configurado neste environment; deploy pulado."
  exit 0
fi

# o hook do Render ja vem com ?key=...; o imgURL troca so a TAG da imagem
IMG_CODIFICADA=$(jq -rn --arg v "$IMAGEM" '$v|@uri')
case "$RENDER_DEPLOY_HOOK_URL" in *\?*) SEP='&' ;; *) SEP='?' ;; esac
echo "Disparando deploy de $IMAGEM"
curl -fsS -X POST "${RENDER_DEPLOY_HOOK_URL}${SEP}imgURL=${IMG_CODIFICADA}" > /dev/null

if [ -z "${RENDER_URL:-}" ]; then
  echo "::warning::Variavel RENDER_URL nao configurada; smoke test pulado."
  exit 0
fi

# smoke test: o plano free do Render pode estar "dormindo" e demorar a subir
for tentativa in $(seq 1 "$TENTATIVAS"); do
  VERSAO=$(curl -fsS --max-time 10 "$RENDER_URL/health" 2> /dev/null | jq -r '.versao // empty' 2> /dev/null || true)
  echo "tentativa $tentativa: versao no ar = ${VERSAO:-indisponivel} (esperada $VERSAO_ESPERADA)"
  if [ "$VERSAO" = "$VERSAO_ESPERADA" ]; then
    echo "Deploy confirmado: $RENDER_URL esta com a versao $VERSAO_ESPERADA"
    exit 0
  fi
  sleep "$ESPERA_S"
done
echo "::error::A versao $VERSAO_ESPERADA nao apareceu em $RENDER_URL/health a tempo."
exit 1
