# Kubernetes Deployment for Clean DDD API

This directory contains the Kubernetes configuration files needed to deploy the Clean DDD API application to a Kubernetes cluster.

## Prerequisites

- Kubernetes cluster (1.19+)
- kubectl installed and configured
- Container registry to store the Docker image
- (Optional) Helm for managing releases

## Files Included

- `deployment.yaml`: Defines the Deployment for running the API containers
- `service.yaml`: Creates a Service for exposing the API within the cluster
- `ingress.yaml`: Sets up an Ingress to expose the API externally
- `configmap.yaml`: Contains non-sensitive configuration settings
- `secret.yaml`: Stores sensitive information like API keys and credentials
- `hpa.yaml`: Configures Horizontal Pod Autoscaler for automatic scaling
- `kustomization.yaml`: Helps manage variations between environments

## Deployment Instructions

### 1. Build and Push the Docker Image

```bash
# From the project root
docker build -t clean-ddd-api:latest -f deployments/Dockerfile .
docker tag clean-ddd-api:latest your-registry/clean-ddd-api:v1.0.0
docker push your-registry/clean-ddd-api:v1.0.0
```

### 2. Update the Secret Values

The `secret.yaml` file contains base64-encoded placeholder values. Replace these with your actual values:

```bash
# Generate the base64 encoded values
echo -n "your-super-secret-jwt-key" | base64
echo -n "admin@yourdomain.com" | base64
echo -n "secure-admin-password" | base64

# Update the values in secret.yaml
```

### 3. Configure Domain and Base URL

Update the following files with your domain:

- `configmap.yaml`: Set the `base_url` to your domain
- `ingress.yaml`: Update the `host` fields with your domain

### 4. Apply the Kubernetes Resources

Using kustomize (built into kubectl):

```bash
# For development environment
kubectl apply -k deployments/kubernetes

# For other environments, use overlays
# kubectl apply -k deployments/kubernetes/overlays/production
```

## Environment Variables

The application uses the following environment variables:

| Variable         | Description                      | Default in Kubernetes |
|------------------|----------------------------------|------------------------|
| PORT             | HTTP port for the application    | 10000                  |
| NODE_ENV         | Environment mode                 | production             |
| PROTOCOL         | HTTP protocol                    | https                  |
| BASE_URL         | Base URL for the application     | From ConfigMap         |
| JWT_SECRET       | Secret for JWT token signing     | From Secret            |
| JWT_EXPIRES_IN   | JWT token expiration time        | 24h                    |
| ADMIN_IDENTIFIER | Admin user identifier (email)    | From Secret            |
| ADMIN_PASSWORD   | Admin user password              | From Secret            |

## Monitoring and Scaling

- The deployment includes liveness and readiness probes
- Horizontal Pod Autoscaler will scale based on CPU and memory usage
- The application exposes a `/health` endpoint for health checks

## Customization for Different Environments

You can use Kustomize overlays to manage different environments:

```
deployments/kubernetes/
├── base/                   # Contains all the files above
└── overlays/
    ├── development/
    │   └── kustomization.yaml
    ├── staging/
    │   └── kustomization.yaml
    └── production/
        └── kustomization.yaml
```

Then apply with:

```bash
kubectl apply -k deployments/kubernetes/overlays/production
```