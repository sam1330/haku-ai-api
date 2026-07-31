# ---- Build stage: needs devDependencies (typescript) to produce ./dist ----
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./

RUN npm ci --ignore-scripts

COPY knexfile.ts ./
COPY src ./src

RUN npm run build

# ---- Runtime stage ----
FROM node:24-alpine

# 1. Install Chromium and the minimum libraries needed to run it
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# 2. Tell Playwright NOT to download its own browsers
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# 3. Tell Playwright where the Alpine Chromium binary is located
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 3001
