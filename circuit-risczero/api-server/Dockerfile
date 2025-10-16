# syntax=docker/dockerfile:1
# Production Dockerfile for RISC Zero Maze API Server (x86_64 Linux)
# For Ubuntu cloud deployment
#
# Prerequisites: Run `cargo risczero build` locally to generate deterministic guest binaries
# This ensures reproducible builds with consistent ImageIDs

############################
# Build stage              #
############################
FROM --platform=linux/amd64 rust:1.90.0-slim-bookworm AS build
WORKDIR /workspace

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        build-essential \
        g++ \
        curl && \
    rm -rf /var/lib/apt/lists/*

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY methods methods/
COPY host host/
COPY api-server api-server/
COPY core core/

# Build the API server in release mode
# RISC0_USE_DOCKER=1 tells risc0-build to use Docker-built binaries from docker/ subdirectory
# The binaries must already exist (generated via `cargo risczero build` locally)
ENV RISC0_USE_DOCKER=1
ENV RISC0_DEV_MODE=1
RUN cargo build --release --package api-server

#############################
# Runtime stage            #
#############################
FROM --platform=linux/amd64 ubuntu:24.04

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates libssl3 curl && \
    rm -rf /var/lib/apt/lists/*

# Copy the compiled binary
COPY --from=build /workspace/target/release/api-server /usr/local/bin/api-server

# Set working directory
WORKDIR /app

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Set environment variables
ENV RISC0_DEV_MODE=1
ENV RUST_LOG=info

# Run the server
CMD ["/usr/local/bin/api-server"]
