#!/usr/bin/env bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Change to the circuit directory
cd "$SCRIPT_DIR/circuit-noir" || exit 1

bb gates \
    --scheme ultra_honk \
    -b ./target/circuit.json

nargo execute

bb prove \
    --scheme ultra_honk \
    -b ./target/circuit.json \
    -w ./target/circuit.gz \
    -o ./target

bb write_vk \
    --scheme ultra_honk \
    -b ./target/circuit.json \
    -o ./target

bb verify \
    --scheme ultra_honk \
    -k ./target/vk \
    -p ./target/proof

xxd -p ./target/public_inputs \
    | tr -d '\n' \
    | awk '{print toupper($0)}' \
    | xargs printf "%s\n" \
    | xargs -I{} echo "ibase=16;{}" \
    | bc
