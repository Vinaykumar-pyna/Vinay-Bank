# syntax=docker/dockerfile:1
# One image for both NestJS applications: the API (default command) and the
# card switch (command: node dist/apps/card-switch/main.js).

FROM node:22-alpine AS build
WORKDIR /app
# The in-memory MongoDB used by the tests is not needed in an image build.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Secrets (.secrets) and data (.data) are mounted at run time, never baked in.
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 4000 4001 5800
CMD ["node", "dist/apps/api/main.js"]
