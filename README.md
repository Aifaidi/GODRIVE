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
- `setup_docker_kind_wsl.sh`: Helper to install Docker/Kind on WSL.

## How to Build & Run Locally

### 1. Build Frontend
Navigate to the frontend directory and build the static assets:
```bash
cd frontend
npm install
npm run build
cd ..
```
This generates the `dist` folder, which Go embeds.

### 2. Build Backend
Build the Go application (requires GCC for SQLite):
```bash
go mod tidy
go build -o godrive.exe .
```

### 3. Run
Execute the binary:
```bash
./godrive.exe
```
The application will be available at [http://localhost:8080](http://localhost:8080).

## Advanced: Run with Docker & Kubernetes (WSL/Linux)

For a full local application stack including Keycloak (OIDC):

### Setup Environment
are on WSL2 and need to set up Docker and Kind:
```bash
./setup_docker_kind_wsl.sh
```

### Deploy
Run the deployment script to create a cluster, build the image, and deploy everything:
```bash
./deploy_local.sh
```
This will:
1. Create a Kind cluster.
2. Build the `godrive` Docker image.
3. Deploy Keycloak and configure it automatically.
4. Deploy GoDrive.

**Access Points:**
- **GoDrive**: http://localhost:30002
- **Keycloak**: http://localhost:8080/realms/master/account (Admin: `admin`/`admin`)

## Features
- Upload files (streamed directly to disk).
- Create folders.
- Browse files and folders.
- **Trash & Star**: Recycle bin and favorites functionality.
- Data stored in `godrive.db` (SQLite) and `uploads/` directory.

- Stateless needed

