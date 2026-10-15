FROM node:20-alpine

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
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3001}/health" > /dev/null || exit 1

CMD ["node", "src/server.js"]
