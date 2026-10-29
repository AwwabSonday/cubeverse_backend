import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import timesRoutes from "./routes/times.routes.js";
import { securityHeaders, rateLimit } from "./middleware/security.middleware.js";

// Load environment variables
dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be set (32+ characters) in backend/.env");
  process.exit(1);
}

// Connect to MongoDB
connectDB();

const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);

// Middlewares
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || "http://localhost:3000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10kb" }));

// Health Check Route
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "CubeVerse Backend API is running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
  });
});

// API Routes
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/auth/register", rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }));
app.use("/api/auth/password", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 300 }));
app.use("/api/auth", authRoutes);
app.use("/api/times", timesRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found - ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? "Internal Server Error" : "Invalid request body.",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 CubeVerse Server running on http://localhost:${PORT}`);
});