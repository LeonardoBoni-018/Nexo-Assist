# Imagem única com os dois processos (app Next.js + serviço de chamados).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    APP_DB_PATH=/app/data/app.db \
    TICKETS_DB_PATH=/app/data/tickets.db
COPY --from=build /app /app
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["npm", "start"]
