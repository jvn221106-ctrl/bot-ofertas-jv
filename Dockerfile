FROM node:24-bookworm-slim AS dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHON=/usr/bin/python3
WORKDIR /app
COPY package*.json ./
ARG npm_config_build_from_source
RUN npm ci --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
