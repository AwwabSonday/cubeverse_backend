import jwt from "jsonwebtoken";
import User from "../models/user.models.js";

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });

      const user = await User.findById(decoded.id).select("-password");
      if (!user) {
        return res.status(401).json({ message: "User not found, authorization denied" });
      }

      if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
        return res.status(401).json({ message: "Password was changed, please log in again" });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error("Token verification error:", error.message);
      return res.status(401).json({ message: "Not authorized, token invalid or expired" });
    }
  } else {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }
};
