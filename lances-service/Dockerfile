# =============================================================================
# Dockerfile  -  "RECEITA" para construir a imagem do lances-service
# -----------------------------------------------------------------------------
# Mesmos passos do auth-service/Dockerfile (la cada linha esta explicada):
#   FROM    -> imagem base com Node 24 (LTS);
#   WORKDIR -> pasta de trabalho /app;
#   COPY package*.json + RUN npm ci -> instala as versoes exatas do lock (com cache);
#   COPY src -> copia o codigo;
#   ARG/ENV VERSAO_IMAGEM -> versao gravada pelo pipeline (aparece no /health);
#   USER node -> nao roda como root;  EXPOSE -> documenta a porta;
#   HEALTHCHECK -> o Docker chama o /health;  CMD -> comando que inicia o servico.
# =============================================================================

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# npm ci instala exatamente o package-lock.json (build reprodutivel)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# versao gravada pelo pipeline (ex.: 1.1.0-dev.12); vazia = usa a do package.json
ARG VERSAO_IMAGEM=""
ENV VERSAO_IMAGEM=${VERSAO_IMAGEM}

# nao roda como root
USER node
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3003}/health" > /dev/null || exit 1

CMD ["node", "src/server.js"]
