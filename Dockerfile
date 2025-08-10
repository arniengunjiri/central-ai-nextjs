# syntax=docker/dockerfile:1

# --- Builder Stage ---
FROM node:18 AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y git curl
RUN npm install -g @anthropic-ai/claude-code@latest
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:18-slim
WORKDIR /app

RUN apt-get update && apt-get install -y git curl ripgrep procps && \
    rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code@latest

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next .next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# === THIS LINE IS REMOVED ===
# The /source_code backup is no longer needed.
# COPY --from=builder /app /source_code

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]