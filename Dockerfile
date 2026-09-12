FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY server ./server
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "--import", "tsx", "server/index.ts"]
