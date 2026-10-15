# =============================================================================
# Dockerfile  -  "RECEITA" para construir a imagem do auth-service
# -----------------------------------------------------------------------------
# Cada linha e um passo. O Docker executa de cima para baixo e guarda cada
# passo em cache: se nada mudou naquele passo, ele reaproveita o resultado.
# O mesmo Dockerfile serve para o docker-compose local e para o pipeline do T2
# (que constroi a imagem, publica no GHCR e faz o deploy no Render).
# =============================================================================

# Imagem base: Linux enxuto (alpine) com Node.js 20 ja instalado.
FROM node:20-alpine

# Pasta de trabalho dentro do container (os proximos comandos rodam nela).
WORKDIR /app
# Indica ambiente de producao para as bibliotecas.
ENV NODE_ENV=production

# Copia PRIMEIRO so o package.json/package-lock.json e instala as dependencias.
# Truque de cache: se voce so mudou o codigo (e nao as dependencias), o Docker
# pula a instalacao na proxima construcao - muito mais rapido.
# npm ci instala EXATAMENTE as versoes do package-lock.json (build reprodutivel);
# --omit=dev nao instala dependencias de desenvolvimento (ex.: jest).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Agora copia o codigo-fonte.
COPY src ./src

# Versao gravada pelo pipeline (ex.: 1.1.0-dev.12); vazia = usa a do package.json.
# Aparece no GET /health, e o smoke test do deploy confere por ela.
ARG VERSAO_IMAGEM=""
ENV VERSAO_IMAGEM=${VERSAO_IMAGEM}

# Seguranca: nao roda como root (o usuario "node" ja existe na imagem base).
USER node
# Documenta a porta usada pelo servico (quem publica de fato e o compose/Render).
EXPOSE 3001

# O Docker pergunta periodicamente "esta vivo?" chamando o /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3001}/health" > /dev/null || exit 1

# Comando executado quando o container inicia.
CMD ["node", "src/server.js"]
