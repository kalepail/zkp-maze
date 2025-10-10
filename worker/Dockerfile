# syntax=docker/dockerfile:1

# Build stage
FROM node:22-alpine AS build

ARG VERSION=0.1.6

WORKDIR /app

# Copy package files
COPY container_src/package*.json ./

# Install dependencies (production only)
RUN npm install --omit=dev --omit=optional

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy dependencies from build stage
COPY --from=build /app/node_modules ./node_modules

# Copy application code and circuit
COPY container_src/server.js ./
COPY container_src/circuit.json ./

# Run as non-root user
USER node:node

EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
