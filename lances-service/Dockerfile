# =============================================================================
# Dockerfile  -  "RECEITA" para construir a imagem do lances-service
# -----------------------------------------------------------------------------
# Mesmos passos do auth-service/Dockerfile (la cada linha esta explicada):
#   FROM    -> imagem base com Node 20;
#   WORKDIR -> pasta de trabalho /app;
#   COPY package*.json + RUN npm install -> instala dependencias (com cache);
#   COPY src -> copia o codigo;
#   EXPOSE  -> documenta a porta;  CMD -> comando que inicia o servico.
# =============================================================================

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3003

CMD ["node", "src/server.js"]
