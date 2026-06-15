import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import apiRouter from "./server/routes";
import { preloadDbFromSupabase, cleanupSupabase, forceSyncAllToSupabase } from "./server/database";

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Pre-heat database cache from Cloud Supabase
  try {
    await preloadDbFromSupabase();
  } catch (err) {
    console.error("[VIIT AMS] Critical: Non-blocking preheat failed, starting with fallbacks:", err);
  }

  // Setup Middleware
  app.use(express.json());
  
  // Custom headers to prevent caching of dynamic assets or API requests
  app.use((req, res, next) => {
    res.setHeader("X-Powered-By", "VIIT System Cell Enterprise AMS");
    next();
  });

  // 1. Mount API Router on /api path
  app.use("/api", apiRouter);

  // Health probe route
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "live", 
      organization: "Vignan's Institute of Information Technology (VIIT)",
      managed_by: "VIIT's System Cell",
      timestamp: new Date().toISOString()
    });
  });

  // 2. Setup static files served by Vite or Express static
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with dynamic Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Use Vite's connect instance as middleware
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode with compiled SPA static pages...");
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve static files from the compiled React client
    app.use(express.static(distPath));
    
    // Capture-all fallback to route back to client React Router (for SPAs)
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind Server on port 3000 and 0.0.0.0
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[VIIT AMS] Corporate Asset Management Server booted successfully.`);
    console.log(`[VIIT AMS] Live Preview URL: http://0.0.0.0:${PORT}`);
  });

  // Start background periodic sync timer (runs every 12 hours / 43200000ms)
  const syncInterval = setInterval(async () => {
    try {
      console.log("[VIIT AMS] Running automatic 12-hour background Supabase synchronization...");
      const stats = await forceSyncAllToSupabase();
      console.log("[VIIT AMS] 12-hour background sync completed successfully:", stats);
    } catch (err: any) {
      console.error("[VIIT AMS] Background periodic synchronization failed:", err.message || err);
    }
  }, 43200000);

  // Handle graceful shutdowns for Supabase WebSocket / Stream cleanups
  const handleShutdown = async (signal: string) => {
    console.log(`[VIIT AMS] ${signal} signal received. Starting graceful cleanup...`);
    clearInterval(syncInterval);
    server.close(async () => {
      console.log("[VIIT AMS] HTTP Server closed.");
      await cleanupSupabase();
      console.log("[VIIT AMS] Safe exits completed.");
      process.exit(0);
    });

    // Force kill if graceful close hangs
    setTimeout(() => {
      console.error("[VIIT AMS] Forced exit due to timeout.");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

startServer().catch((err) => {
  console.error("Critical error while starting VIIT Enterprise AMS Host: ", err);
});
