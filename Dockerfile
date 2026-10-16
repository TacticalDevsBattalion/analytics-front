# Базові образи — з внутрішнього реєстру: node:24 там уже з k2 CA (NODE_EXTRA_CA_CERTS),
# nginx — дзеркало Docker Hub. Поза мережею k2: --build-arg REGISTRY=docker.io/library
ARG REGISTRY=10.20.50.25:8081

FROM ${REGISTRY}/node:24 AS dependencies
WORKDIR /app/frontend
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . ./

FROM dependencies AS development
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

FROM dependencies AS build
# prebuild synchronizes runtime config (the OpenAPI client is generated manually: npm run api:generate).
RUN npm run build

FROM ${REGISTRY}/nginx:1.29-alpine AS production
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV API_PREFIX=/api
# Типові значення — для docker compose (DNS Docker, сервіс backend); у k8s їх перевизначає deploy.yaml.
ENV NGINX_RESOLVER=127.0.0.11
ENV BACKEND_UPSTREAM=backend:8000
ENV NGINX_ENVSUBST_FILTER=^(API_PREFIX|NGINX_RESOLVER|BACKEND_UPSTREAM)$
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
