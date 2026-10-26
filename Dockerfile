FROM node:24-alpine

RUN apk add --no-cache openssl libc6-compat ffmpeg

WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY packages/crypto/package.json packages/crypto/
COPY apps/api/prisma apps/api/prisma

RUN npm ci --no-audit --no-fund

COPY . .

RUN cd apps/api && DATABASE_URL=postgresql://build@localhost/build npx prisma generate

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NODE_ENV=production
RUN npm run build -w @six/web
