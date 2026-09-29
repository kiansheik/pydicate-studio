FROM node:24-bookworm-slim AS build
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY server/package*.json ./server/
RUN npm --prefix server ci --omit=dev
COPY . .
RUN npm run build:app

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 git util-linux ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /data /workspace /claude-homes && chown node:node /data /workspace /claude-homes
RUN npm install --global @openai/codex@0.153.4
# Each contributor signs in to this unmodified binary with their own Claude
# subscription; it is never patched and its auth methods are never removed.
RUN npm install --global @anthropic-ai/claude-code@2.1.236
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
ENV COLLAB_HOST=0.0.0.0 COLLAB_PORT=8787 COLLAB_STATE_DIR=/data PYDICATE_PROJECT_PARENT=/workspace PYDICATE_PYTHON=python3 \
    COLLAB_CLAUDE_HOME=/claude-homes DISABLE_AUTOUPDATER=1
EXPOSE 8787
CMD ["node", "server/start.cjs"]
