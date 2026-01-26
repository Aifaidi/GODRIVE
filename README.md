# GoDrive

A self-hosted "Google Drive" clone built with Go (Echo) and React (Vite).

## Prerequisites

### Standard Run
- **Go**: v1.22+
- **Node.js**: v18+ (for building the frontend)
- **GCC**: Required for SQLite (CGO)

### Container / Kubernetes Run
- **Docker**
- **Kind** (Kubernetes in Docker)
- **Kubectl**

## Project Structure

- `main.go`: Application entry point.
- `internal/`: Backend logic (handlers, models, storage).
- `frontend/`: React + Vite application.
- `k8s/`: Kubernetes manifests.
- `deploy_local.sh`: Script to deploy locally with Kind and Keycloak.



