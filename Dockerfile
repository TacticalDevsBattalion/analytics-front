FROM node:24-alpine AS dependencies
WORKDIR /app/frontend

# Public corporate CA certificates, including OfflineRootCA.crt, are optional.
# Actual .env files, keys and local dependencies are excluded by .dockerignore.
COPY certs/ /tmp/app-certificates/
RUN apk add --no-cache ca-certificates \
    && find /tmp/app-certificates -maxdepth 1 -name '*.crt' -exec cp {} /usr/local/share/ca-certificates/ \; \
    && update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . ./

FROM dependencies AS development
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

FROM dependencies AS build
# prebuild synchronizes runtime config (the OpenAPI client is generated manually: npm run api:generate).
RUN npm run build

FROM nginx:1.29-alpine AS production
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV API_PREFIX=/api
ENV NGINX_ENVSUBST_FILTER=API_PREFIX
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
