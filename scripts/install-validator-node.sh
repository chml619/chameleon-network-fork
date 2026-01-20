#!/bin/bash
# Chameleon Network - Validator Node (vNode) Install Script
# Usage: curl -sSL https://raw.githubusercontent.com/chmldev/chameleon-network/develop/scripts/install-validator-node.sh | bash

set -e

echo ""
echo "🦎 Chameleon Network - Validator Node Installation"
echo "==================================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (sudo)"
    exit 1
fi

# Default ports (can be overridden for multi-node setup)
P2P_PORT=${P2P_PORT:-30333}
RPC_PORT=${RPC_PORT:-9944}
NODE_NAME=${NODE_NAME:-"Chameleon-vNode-$(hostname)-$P2P_PORT"}

# Variables
INSTALL_DIR="/opt/chameleon"
DATA_DIR="/var/lib/chameleon/node-$P2P_PORT"
BINARY_URL="https://github.com/chmldev/chameleon-network/releases/download/devnet-latest/chameleon-node-devnet"
CHAINSPEC_URL="https://raw.githubusercontent.com/chmldev/chameleon-network/develop/chainspec.json"
BOOTNODE="/ip4/64.23.233.36/tcp/30333/p2p/12D3KooWEyoppNCUx8Yx66oV9fJnriXwCcXwDDUA2kj6vnc6iDEp"

echo "📋 Configuration:"
echo "   P2P Port: $P2P_PORT"
echo "   RPC Port: $RPC_PORT"
echo "   Node Name: $NODE_NAME"
echo "   Data Dir: $DATA_DIR"
echo ""

# Create directories
echo "📁 Creating directories..."
mkdir -p $INSTALL_DIR
mkdir -p $DATA_DIR

# Download binary (skip if exists)
if [ ! -f "$INSTALL_DIR/chameleon-node-devnet" ]; then
    echo "⬇️  Downloading Chameleon node binary..."
    curl -L -o $INSTALL_DIR/chameleon-node-devnet $BINARY_URL
    chmod +x $INSTALL_DIR/chameleon-node-devnet
else
    echo "✅ Binary already exists, skipping download..."
fi

# Download chainspec (skip if exists)
if [ ! -f "$INSTALL_DIR/chainspec.json" ]; then
    echo "⬇️  Downloading chainspec..."
    curl -L -o $INSTALL_DIR/chainspec.json $CHAINSPEC_URL
else
    echo "✅ Chainspec already exists, skipping download..."
fi

# Generate node key
echo "🔑 Generating node key..."
$INSTALL_DIR/chameleon-node-devnet key generate-node-key --file $DATA_DIR/node-key 2>/dev/null || true
PEER_ID=$($INSTALL_DIR/chameleon-node-devnet key inspect-node-key --file $DATA_DIR/node-key 2>/dev/null)

# Create systemd service
SERVICE_NAME="chameleon-vnode-$P2P_PORT"
echo "⚙️  Creating systemd service: $SERVICE_NAME..."
cat > /etc/systemd/system/$SERVICE_NAME.service << SERVICE
[Unit]
Description=Chameleon Network Validator Node (Port $P2P_PORT)
After=network.target

[Service]
Type=simple
User=root
ExecStart=$INSTALL_DIR/chameleon-node-devnet \\
    --base-path $DATA_DIR \\
    --chain $INSTALL_DIR/chainspec.json \\
    --port $P2P_PORT \\
    --rpc-port $RPC_PORT \\
    --rpc-external \\
    --rpc-cors=all \\
    --rpc-methods=unsafe \\
    --validator \\
    --name "$NODE_NAME" \\
    --node-key-file $DATA_DIR/node-key \\
    --bootnodes $BOOTNODE
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

# Enable and start service
echo "🚀 Starting validator node..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

# Wait for node to start
echo "⏳ Waiting for node to initialize..."
sleep 10

# Generate session keys via RPC
echo "🔐 Generating session keys..."
SESSION_KEYS=$(curl -s -H "Content-Type: application/json" \
    -d '{"id":1, "jsonrpc":"2.0", "method": "author_rotateKeys", "params":[]}' \
    http://127.0.0.1:$RPC_PORT | jq -r '.result')

# Get external IP
EXTERNAL_IP=$(curl -s ifconfig.me || echo "UNKNOWN")

echo ""
echo "==================================================="
echo "✅ Chameleon Validator Node Installed Successfully!"
echo "==================================================="
echo ""
echo "📋 NODE INFORMATION (SAVE THIS!):"
echo "---------------------------------------------------"
echo "   Service Name: $SERVICE_NAME"
echo "   External IP:  $EXTERNAL_IP"
echo "   P2P Port:     $P2P_PORT"
echo "   RPC Port:     $RPC_PORT"
echo "   Peer ID:      $PEER_ID"
echo ""
echo "🔑 SESSION KEYS (REQUIRED FOR MOBILE APP):"
echo "---------------------------------------------------"
echo "   $SESSION_KEYS"
echo "---------------------------------------------------"
echo ""
echo "📱 NEXT STEPS - Complete in Chameleon Wallet App:"
echo "   1. Go to Power tab → Register Validator Node"
echo "   2. Enter IP Address: $EXTERNAL_IP"
echo "   3. Enter Port: $P2P_PORT"
echo "   4. Enter Session Keys: (copy from above)"
echo "   5. Stake exactly 1,750 pCHML"
echo "   6. Wait for next session (up to ~5 minutes) to become Active"
echo ""
echo "🔧 USEFUL COMMANDS:"
echo "   Status:  systemctl status $SERVICE_NAME"
echo "   Logs:    journalctl -u $SERVICE_NAME -f"
echo "   Stop:    systemctl stop $SERVICE_NAME"
echo "   Restart: systemctl restart $SERVICE_NAME"
echo ""
echo "📦 MULTI-NODE SETUP (same server, different wallet):"
echo "   P2P_PORT=30334 RPC_PORT=9945 bash install-validator-node.sh"
echo ""
echo "🦎 Welcome to Chameleon Network!"
echo ""
