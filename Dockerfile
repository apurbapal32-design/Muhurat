# Production container for Google Cloud Run (Express + WebSocket /ws/market + Vite frontend)
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install dependencies (including devDeps needed for Vite + esbuild build step)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy application sources and build dist/ + dist/server.cjs
COPY . .
RUN npm run build && npm prune --omit=dev

EXPOSE 8080

CMD ["npm", "start"]
