# syntax=docker/dockerfile:1

# --- build ---------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

# --- run -----------------------------------------------------------------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	ARDOISE_DATA_DIR=/data

# Unprivileged user, and the only writable place is the data volume.
RUN addgroup -S ardoise && adduser -S ardoise -G ardoise \
	&& mkdir -p /data && chown ardoise:ardoise /data
COPY --from=build --chown=ardoise:ardoise /app/build ./build
COPY --from=build --chown=ardoise:ardoise /app/node_modules ./node_modules
COPY --from=build --chown=ardoise:ardoise /app/package.json ./
USER ardoise

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
	CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "build"]
