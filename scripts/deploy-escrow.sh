#!/bin/bash
# Deploy TempoStreamChannel escrow contract to Moderato (testnet)
#
# Required environment variables:
#   DEPLOYER_PRIVATE_KEY - Private key for deployer account
#
# Optional:
#   TEMPO_RPC_URL - RPC URL (default: https://rpc.moderato.tempo.xyz)
#
# Usage:
#   ./scripts/deploy-escrow.sh
#
# The script will:
#   1. Fund the deployer address if needed (using tempo_fundAddress)
#   2. Deploy the contract
#   3. Output the contract address

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/packages/stream-channels"

# Configuration
RPC_URL="${TEMPO_RPC_URL:-https://rpc.moderato.tempo.xyz}"
CHAIN_ID=42431

# Check required tools
command -v cast >/dev/null 2>&1 || { echo "Error: cast (foundry) is required"; exit 1; }
command -v forge >/dev/null 2>&1 || { echo "Error: forge (foundry) is required"; exit 1; }

# Check required env vars
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "Error: DEPLOYER_PRIVATE_KEY environment variable is required"
    exit 1
fi

# Get deployer address from private key
DEPLOYER_ADDRESS=$(cast wallet address "$DEPLOYER_PRIVATE_KEY")
echo "Deployer address: $DEPLOYER_ADDRESS"

# Check balance
BALANCE=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
echo "Current balance: $BALANCE wei"

# Fund if balance is low (less than 0.1 ETH)
MIN_BALANCE="100000000000000000"  # 0.1 ETH in wei
if [ "$(echo "$BALANCE < $MIN_BALANCE" | bc)" -eq 1 ] 2>/dev/null || [ "$BALANCE" = "0" ]; then
    echo "Balance is low, funding deployer..."
    cast rpc tempo_fundAddress "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL"
    sleep 2
    NEW_BALANCE=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL")
    echo "New balance: $NEW_BALANCE wei"
fi

# Install Solady if not present
if [ ! -d "$CONTRACTS_DIR/lib/solady" ]; then
    echo "Installing Solady..."
    cd "$CONTRACTS_DIR"
    forge install Vectorized/solady --no-commit
fi

# Build contracts
echo "Building contracts..."
cd "$CONTRACTS_DIR"
forge build

# Deploy
echo "Deploying TempoStreamChannel..."
DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol:DeployScript \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --legacy \
    -vvv 2>&1)

echo "$DEPLOY_OUTPUT"

# Extract deployed address from output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE "TempoStreamChannel deployed at: 0x[a-fA-F0-9]{40}" | grep -oE "0x[a-fA-F0-9]{40}" | head -1)

if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Error: Could not extract contract address from deployment output"
    exit 1
fi

echo ""
echo "=========================================="
echo "Deployment successful!"
echo "Contract address: $CONTRACT_ADDRESS"
echo "Network: Moderato (Chain ID: $CHAIN_ID)"
echo "RPC: $RPC_URL"
echo "=========================================="

# Output for CI consumption
echo "STREAM_ESCROW_CONTRACT=$CONTRACT_ADDRESS" >> "${GITHUB_OUTPUT:-/dev/null}"
