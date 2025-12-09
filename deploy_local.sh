#!/bin/bash
set -e

echo "=== 1. Creating Kind Cluster ==="
kind create cluster --config k8s/kind-config.yaml --name godrive-oidc || echo "Cluster may already exist"

echo "=== 2. Building GoDrive Image ==="
docker build --no-cache -t godrive:local .

echo "=== 3. Loading Image into Kind ==="
kind load docker-image godrive:local --name godrive-oidc

echo "=== 4. Deploying Keycloak ==="
kubectl apply -f k8s/keycloak.yaml
echo "Waiting for Keycloak to be ready (this may take a minute)..."
kubectl wait --for=condition=ready pod -l app=keycloak --timeout=120s

echo "=== 5. Configuring Keycloak (Automatic) ==="
# We will use a temp pod with curl to configure Keycloak if needed, 
# but for now, we rely on the user creating the client or using a script.
# Actually, let's try to auto-configure the client using the kdadm CLI inside the container!

KC_POD=$(kubectl get pod -l app=keycloak -o jsonpath="{.items[0].metadata.name}")

echo "Creating 'godrive-webapp' client in Keycloak..."
kubectl exec $KC_POD -- /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin

echo "Creating 'testuser'..."
kubectl exec $KC_POD -- /opt/keycloak/bin/kcadm.sh create users -r master -s username=testuser -s enabled=true || echo "User testuser likely exists..."
kubectl exec $KC_POD -- /opt/keycloak/bin/kcadm.sh set-password -r master --username testuser --new-password password || echo "Password set failed/skipped"
kubectl exec $KC_POD -- /opt/keycloak/bin/kcadm.sh create clients -r master -s clientId=godrive-webapp -s enabled=true -s publicClient=true -s 'redirectUris=["http://localhost:30002/*", "http://localhost:8000/*", "http://localhost:5173/*"]' -s 'webOrigins=["+"]' || echo "Client likely exists..."

echo "Fetching Client UUID..."
CID=$(kubectl exec $KC_POD -- /opt/keycloak/bin/kcadm.sh get clients -r master -q clientId=godrive-webapp --fields id --format csv --noquotes | tr -d '\r')

echo "Updating Client $CID..."
kubectl exec $KC_POD -- /opt/keycloak/bin/kcadm.sh update clients/$CID -r master -s 'redirectUris=["http://localhost:8000", "http://localhost:8000/*", "http://localhost:5173", "http://localhost:5173/*"]' -s 'webOrigins=["+"]'

echo "Checking for Audience Mapper..."
if kubectl exec $KC_POD -- /opt/keycloak/bin/kcadm.sh get clients/$CID/protocol-mappers/models -r master | grep -q "audience-mapper"; then
    echo "Audience mapper already exists."
else
    echo "Creating Audience Mapper for $CID..."
    # Use JSON via stdin to avoid shell escaping issues with "config" properties
    kubectl exec -i $KC_POD -- /opt/keycloak/bin/kcadm.sh create clients/$CID/protocol-mappers/models -r master -f - <<EOF
{
  "name": "audience-mapper",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-audience-mapper",
  "consentRequired": false,
  "config": {
    "included.client.audience": "godrive-webapp",
    "id.token.claim": "true",
    "access.token.claim": "true"
  }
}
EOF
fi

echo "=== 6. Deploying GoDrive ==="
kubectl apply -f k8s/auth-config-local.yaml
kubectl apply -f k8s/deployment-local.yaml
kubectl rollout restart deployment/godrive
kubectl rollout status deployment/godrive

echo "=== Deployment Complete ==="
echo "Keycloak: http://localhost:8080/realms/master/account"
echo "GoDrive:  http://localhost:30002"
echo ""
echo "Login credentials (Keycloak Admin): admin / admin"
