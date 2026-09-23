# =============================================================================
# Dockerfile  -  "RECEITA" para construir a imagem do auth-service
# -----------------------------------------------------------------------------
# Cada linha e um passo. O Docker executa de cima para baixo e guarda cada
# passo em cache: se nada mudou naquele passo, ele reaproveita o resultado.
# =============================================================================

# Imagem base: Linux enxuto (alpine) com Node.js 20 ja instalado.
FROM node:20-alpine

# Pasta de trabalho dentro do container (os proximos comandos rodam nela).
WORKDIR /app

# Copia PRIMEIRO so o package.json/package-lock.json e instala as dependencias.
# Truque de cache: se voce so mudou o codigo (e nao as dependencias), o Docker
# pula o npm install na proxima construcao - muito mais rapido.
COPY package*.json ./
# --omit=dev: nao instala dependencias de desenvolvimento (ex.: jest).
RUN npm install --omit=dev

# Agora copia o codigo-fonte.
COPY src ./src

# Indica ambiente de producao para as bibliotecas.
ENV NODE_ENV=production
# Documenta a porta usada pelo servico (quem publica de fato e o compose).
EXPOSE 3001

# Comando executado quando o container inicia.
CMD ["node", "src/server.js"]
