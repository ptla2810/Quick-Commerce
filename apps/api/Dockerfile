# Production image for the API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t padosi-api .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @padosi/api --workspace @padosi/shared --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @padosi/api

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/package.json ./package.json
USER node
EXPOSE 4000
# Apply pending migrations, then start. Never run the demo seed in production.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
