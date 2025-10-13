import { Container, getContainer } from "@cloudflare/containers";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { timeout } from "hono/timeout";

export class MyContainer extends Container<Env> {
  autoscale = true;
  autoScale = true;
  // Port the container listens on (default: 8080)
  defaultPort = 8080;
  // Time before container sleeps due to inactivity
  sleepAfter = "5m";
  // Environment variables passed to the container
  envVars = {
    NODE_ENV: "production",
  };

  // Optional lifecycle hooks
  override onStart() {
    console.log("Noir container successfully started");
  }

  override onStop() {
    console.log("Noir container successfully shut down");
  }

  override onError(error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("Noir container error:", errorMessage);
  }
}

// Create Hono app with proper typing for Cloudflare Workers
const app = new Hono<{
  Bindings: Env;
}>().basePath('/api');

// Apply logger middleware to all routes
app.use('*', logger());

// Apply generous CORS to all routes
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400,
  credentials: true,
}));

// Apply 2-minute timeout for prove endpoint (ZK proofs can take time)
app.use('/prove', timeout(120000));

// Apply 30-second timeout to other routes
app.use('*', timeout(30000));

// Home route with available endpoints
app.get("/", (c) => {
  return c.json({
    name: "Noir ZK Proof Service",
    version: "2.0.1",
    runtime: "Rust + Barretenberg CLI",
    endpoints: {
      "POST /api/prove": "Generate ZK proof from witness (using bb executable)",
      "GET /api/health": "Health check",
    },
    note: "All binary data should be base64 encoded. This service uses the Barretenberg CLI for proof generation.",
  });
});

// Health check endpoint - proxy to container
app.get("/health", async (c) => {
  try {
    const container = getContainer(c.env.MY_CONTAINER);
    const response = await container.fetch(c.req.raw);
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Health check error:', errorMessage);
    return c.json({ error: 'Container health check failed', message: errorMessage }, 500);
  }
});

// POST /prove - Generate proof from witness using bb executable
app.post("/prove", async (c) => {
  try {
    const container = getContainer(c.env.MY_CONTAINER);
    const response = await container.fetch(c.req.raw);
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Prove error:', errorMessage);
    return c.json({ error: 'Container prove failed', message: errorMessage }, 500);
  }
});

// Error handling middleware
app.onError((err, c) => {
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: c.req.url,
    method: c.req.method,
  });

  // Return appropriate error response
  return c.json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString(),
  }, 500);
});

export default app;
