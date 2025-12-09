# Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Build Backend
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy frontend dist to expected location for embedding
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
# CGO_ENABLED=0 for static binary
RUN CGO_ENABLED=0 GOOS=linux go build -o godrive .

# Final Stage
FROM alpine:latest
WORKDIR /app
COPY --from=backend-builder /app/godrive .
# Create uploads directory
RUN mkdir uploads
EXPOSE 8080
CMD ["./godrive"]
