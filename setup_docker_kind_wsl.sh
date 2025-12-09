#!/bin/bash
set -e

echo "Starting setup for Docker, Kind, and Kubectl on WSL Ubuntu..."

# 1. Update and Install Prerequisites
echo "Update and Install Prerequisites..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# 2. Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    sudo mkdir -p /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    fi
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Start Docker daemon if not running (systemd on modern WSL)
    if ! sudo service docker status > /dev/null; then
        echo "Starting Docker service..."
        sudo service docker start
    fi
    
    # Add user to docker group
    echo "Adding user $USER to docker group..."
    sudo usermod -aG docker $USER
    echo "NOTICE: You may need to log out and log back in (or restart WSL) for docker group changes to take effect."
else
    echo "Docker is already installed."
fi

# 3. Install Kubectl
if ! command -v kubectl &> /dev/null; then
    echo "Installing Kubectl..."
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
    sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
    rm kubectl
else
    echo "Kubectl is already installed."
fi

# 4. Install Kind
if ! command -v kind &> /dev/null; then
    echo "Installing Kind..."
    [ $(uname -m) = x86_64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
    chmod +x ./kind
    sudo mv ./kind /usr/local/bin/kind
else
    echo "Kind is already installed."
fi

echo "Setup script completed."
echo "Please verify installation by running: docker version && kind --version && kubectl version --client"
