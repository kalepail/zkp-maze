#!/bin/bash
# Test script for RISC Zero Maze API

set -e

API_URL="${API_URL:-http://localhost:8080}"

echo "Testing RISC Zero Maze API at $API_URL"
echo "========================================"

# Test health endpoint
echo ""
echo "1. Testing health endpoint..."
curl -s "$API_URL/health" | jq .

# Test generate maze endpoint
echo ""
echo "2. Generating maze proof (this may take a while)..."
MAZE_RESPONSE=$(curl -s -X POST "$API_URL/api/generate-maze" \
  -H "Content-Type: application/json" \
  -d '{"seed": 12345}')

echo "$MAZE_RESPONSE" | jq '{success, maze_seed: .maze_proof.maze_seed, grid_size: (.maze_proof.grid_data | length)}'

# Extract maze proof for next test
MAZE_PROOF=$(echo "$MAZE_RESPONSE" | jq -c '.maze_proof')

# Test verify path endpoint
echo ""
echo "3. Verifying path (this may take a while)..."
PATH_RESPONSE=$(curl -s -X POST "$API_URL/api/verify-path" \
  -H "Content-Type: application/json" \
  -d "{\"maze_proof\": $MAZE_PROOF, \"moves\": [1, 1, 2, 2]}")

echo "$PATH_RESPONSE" | jq '{success, is_valid: .path_proof.is_valid, maze_seed: .path_proof.maze_seed}'

# Extract path proof for next test
PATH_PROOF=$(echo "$PATH_RESPONSE" | jq -c '.path_proof')

# Test verify proof endpoint
echo ""
echo "4. Verifying proof..."
VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/api/verify-proof" \
  -H "Content-Type: application/json" \
  -d "{\"path_proof\": $PATH_PROOF}")

echo "$VERIFY_RESPONSE" | jq .

echo ""
echo "========================================"
echo "All tests completed successfully!"
