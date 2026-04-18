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

RUN npm ci --only=production

COPY . .

EXPOSE 3001
