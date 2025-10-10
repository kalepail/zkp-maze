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
  // Time before container sleeps due to inactivity (default: 30s)
  sleepAfter = "1m";
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
    console.log("Noir container error:", error);
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

// Apply 30-second timeout to all routes
app.use('*', timeout(30000));

// Home route with available endpoints
app.get("/", (c) => {
  return c.json({
    name: "Noir ZK Proof Service",
    endpoints: {
      "POST /api/witness": "Generate witness from circuit inputs",
      "POST /api/prove": "Generate ZK proof from witness",
      "POST /api/verify": "Verify a ZK proof",
      "GET /api/health": "Health check",
    },
    note: "All binary data should be base64 encoded",
  });
});

// Health check endpoint - proxy to container
app.get("/health", async (c) => {
  try {
    const container = getContainer(c.env.MY_CONTAINER);
    return await container.fetch(c.req.raw);
  } catch (error) {
    return c.json({ status: "error", message: String(error) }, 503);
  }
});

// POST /witness - Generate witness from inputs
app.post("/witness", async (c) => {
  const container = getContainer(c.env.MY_CONTAINER);
  return await container.fetch(c.req.raw);
});

// POST /prove - Generate proof from witness
app.post("/prove", async (c) => {
  const container = getContainer(c.env.MY_CONTAINER);
  // const container = await getRandom(c.env.MY_CONTAINER, MAX_INSTANCES);
  return await container.fetch(c.req.raw);
});

// POST /verify - Verify a proof
app.post("/verify", async (c) => {
  const container = getContainer(c.env.MY_CONTAINER);
  return await container.fetch(c.req.raw);
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
