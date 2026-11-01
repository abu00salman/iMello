# iMello policy API. Build from the repository root:
#   docker build -f services/api/Dockerfile -t imello-api .
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY services/api/package.json services/api/
RUN pnpm install --frozen-lockfile --filter @imello/api... --prod=false

FROM node:22-alpine
RUN corepack enable && addgroup -S imello && adduser -S imello -G imello
WORKDIR /repo
COPY --from=deps /repo /repo
COPY packages/core packages/core
COPY services/api services/api
USER imello
WORKDIR /repo/services/api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=8787
EXPOSE 8787
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "--import", "tsx", "src/server.ts"]
