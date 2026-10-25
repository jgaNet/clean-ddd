# Deployment Options for Clean DDD API

This directory contains various deployment configurations for the Clean DDD API application.

## Deployment Options Available

### 1. Docker Development Environment
Located in `/deployments/dev/`

Use this for local development:

```bash
docker-compose -f deployments/dev/docker-compose.yml up -d
```

This will start the application in development mode with hot-reloading and exposed on port 10000.

### 2. Docker Production Build
Located in `/deployments/Dockerfile`

To build a production Docker image:

```bash
docker build -t clean-ddd-api:latest -f deployments/Dockerfile .
```

Then run it:

```bash
docker run -p 10000:10000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secret-key \
  -e ADMIN_PASSWORD=secure-password \
  clean-ddd-api:latest
```

### 3. Kubernetes Deployment
Located in `/deployments/kubernetes/`

For deploying to a Kubernetes cluster with all necessary resources:
- Deployment
- Service
- Ingress
- ConfigMap
- Secret
- HorizontalPodAutoscaler

See the `/deployments/kubernetes/README.md` file for detailed instructions.

## Configuration

The application uses the following environment variables:

| Variable         | Description                      | Default              |
|------------------|----------------------------------|----------------------|
| PORT             | HTTP port for the application    | 10000                |
| NODE_ENV         | Environment mode                 | dev                  |
| PROTOCOL         | HTTP protocol                    | http                 |
| BASE_URL         | Base URL for the application     | localhost            |
| JWT_SECRET       | Secret for JWT token signing     | development-secret   |
| JWT_EXPIRES_IN   | JWT token expiration time        | 24h                  |
| ADMIN_IDENTIFIER | Admin user identifier (email)    | admin@admin.fr       |
| ADMIN_PASSWORD   | Admin user password              | admin                |

## Build Process

The build process uses esbuild to bundle the application:

```bash
npm run build
```

This runs the build script at `/deployments/build.js`, which:
1. Bundles the TypeScript code
2. Properly handles ESM modules
3. Preserves compatibility with external dependencies