FROM node:24-alpine AS dependencies
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY apps/api apps/api
RUN pnpm --filter @wedding/api build

FROM node:24-alpine AS runner
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=dependencies /workspace/package.json /workspace/pnpm-workspace.yaml ./
COPY --from=builder /workspace/apps/api ./apps/api
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
