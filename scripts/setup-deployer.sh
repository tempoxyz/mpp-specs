#!/bin/bash
# Generate a new deployer wallet and output instructions for adding it as a secret
#
# This script generates a new wallet for deploying contracts.
# The private key should be added as a GitHub secret: ESCROW_DEPLOYER_PRIVATE_KEY
#
# Usage:
#   ./scripts/setup-deployer.sh

set -e

# Check required tools
command -v cast >/dev/null 2>&1 || { echo "Error: cast (foundry) is required. Install with: curl -L https://foundry.paradigm.xyz | bash"; exit 1; }

echo "Generating new deployer wallet..."
echo ""

# Generate new wallet
WALLET_OUTPUT=$(cast wallet new)
ADDRESS=$(echo "$WALLET_OUTPUT" | grep "Address:" | awk '{print $2}')
PRIVATE_KEY=$(echo "$WALLET_OUTPUT" | grep "Private key:" | awk '{print $3}')

echo "=========================================="
echo "NEW DEPLOYER WALLET"
echo "=========================================="
echo ""
echo "Address:     $ADDRESS"
echo "Private Key: $PRIVATE_KEY"
echo ""
echo "=========================================="
echo "NEXT STEPS"
echo "=========================================="
echo ""
echo "1. Add the private key as a GitHub secret:"
echo "   - Go to: https://github.com/tempoxyz/ai-payments/settings/secrets/actions"
echo "   - Click 'New repository secret'"
echo "   - Name: ESCROW_DEPLOYER_PRIVATE_KEY"
echo "   - Value: $PRIVATE_KEY"
echo ""
echo "2. Fund the deployer on Moderato (testnet):"
echo "   cast rpc tempo_fundAddress $ADDRESS --rpc-url https://rpc.moderato.tempo.xyz"
echo ""
echo "3. Deploy the contract via GitHub Actions:"
echo "   - Go to: https://github.com/tempoxyz/ai-payments/actions/workflows/deploy-escrow.yml"
echo "   - Click 'Run workflow'"
echo "   - Select network: moderato"
echo ""
echo "Or deploy locally:"
echo "   DEPLOYER_PRIVATE_KEY=$PRIVATE_KEY ./scripts/deploy-escrow.sh"
echo ""
