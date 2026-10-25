# Built from the repository root, so the shared front end (`web/`) ships beside the TypeScript
# application that serves it:
#   docker build -t clean-ddd-api:latest -f typescript/deployments/Dockerfile .

# Build Stage
# ---
FROM node:24.9.0-alpine AS builder

WORKDIR /opt/app/typescript

COPY typescript/package.json ./
COPY typescript/yarn.lock ./
RUN yarn install --omit optional
COPY typescript/ .
RUN yarn build
RUN rm -rf node_modules && yarn install --production --ignore-scripts


# Run Stage
# ---
FROM node:24.9.0-slim

USER node

COPY --chown=node --from=builder /opt/app/typescript /opt/app/typescript
COPY --chown=node web /opt/app/web
WORKDIR /opt/app/typescript

ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV
ENV PORT 10000

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD [ "node", "-e", "require('http').get('http://localhost:10000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))" ]

CMD ["yarn", "start"]
