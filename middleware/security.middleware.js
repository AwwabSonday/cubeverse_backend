export const securityHeaders = (req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
  next();
};

// ponytail: in-memory and per-process; swap for a shared store (Redis) if you run several instances.
export const rateLimit = ({ windowMs, max }) => {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset < now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(req.ip, entry);
    }
    if (++entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
      });
    }
    next();
  };
};
