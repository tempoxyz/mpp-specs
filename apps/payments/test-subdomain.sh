#!/usr/bin/env bash
# Test script for subdomain-based routing
# Usage: ./test-subdomain.sh

set -euo pipefail

PROXY_URL="${PROXY_URL:-http://localhost:8787}"

echo "=================================="
echo "Testing Subdomain-Based Routing"
echo "=================================="
echo ""

# Test 1: Root endpoint without subdomain (should list partners)
echo "1. Testing root endpoint (no subdomain)..."
echo "   curl -s $PROXY_URL/"
response=$(curl -s "$PROXY_URL/")
echo "   Response: $(echo "$response" | head -c 200)..."
echo ""

# Test 2: Root endpoint with browserbase subdomain (should show partner info)
echo "2. Testing root endpoint with browserbase subdomain..."
echo "   curl -s -H 'Host: browserbase.localhost' $PROXY_URL/"
response=$(curl -s -H "Host: browserbase.localhost" "$PROXY_URL/")
echo "   Response: $(echo "$response" | head -c 200)..."
echo ""

# Test 3: Health check
echo "3. Testing health endpoint..."
echo "   curl -s $PROXY_URL/health"
response=$(curl -s "$PROXY_URL/health")
echo "   Response: $response"
echo ""

# Test 4: API endpoint with subdomain (should return 402 for paid endpoint)
echo "4. Testing paid endpoint (POST /v1/sessions)..."
echo "   curl -s -X POST -H 'Host: browserbase.localhost' -H 'Content-Type: application/json' $PROXY_URL/v1/sessions -d '{\"projectId\": \"test\"}'"
response=$(curl -s -w "\n   HTTP Status: %{http_code}" -X POST \
  -H "Host: browserbase.localhost" \
  -H "Content-Type: application/json" \
  "$PROXY_URL/v1/sessions" \
  -d '{"projectId": "test"}')
echo "   Response: $response"
echo ""

# Test 5: Free endpoint with subdomain (GET sessions - should try to proxy)
echo "5. Testing free endpoint (GET /v1/sessions)..."
echo "   curl -s -H 'Host: browserbase.localhost' $PROXY_URL/v1/sessions"
response=$(curl -s -w "\n   HTTP Status: %{http_code}" \
  -H "Host: browserbase.localhost" \
  "$PROXY_URL/v1/sessions")
echo "   Response: $(echo "$response" | head -c 300)..."
echo ""

# Test 6: Invalid subdomain
echo "6. Testing invalid subdomain..."
echo "   curl -s -H 'Host: invalid.localhost' $PROXY_URL/v1/sessions"
response=$(curl -s -w "\n   HTTP Status: %{http_code}" \
  -H "Host: invalid.localhost" \
  "$PROXY_URL/v1/sessions")
echo "   Response: $response"
echo ""

# Test 7: No subdomain on API path (should fail)
echo "7. Testing API path without subdomain (should fail)..."
echo "   curl -s $PROXY_URL/v1/sessions"
response=$(curl -s -w "\n   HTTP Status: %{http_code}" "$PROXY_URL/v1/sessions")
echo "   Response: $response"
echo ""

echo "=================================="
echo "All tests completed!"
echo "=================================="
