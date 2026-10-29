import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.models.js";
import { sendMail } from "../utils/mailer.js";
import { checkUsername, checkEmail, checkPassword, collect, sendInvalid } from "../utils/validate.js";

// Compared against when the user does not exist, so login timing doesn't reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync("cubeverse-timing-pad", 10);

// Helper to generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const errors = collect({
      username: checkUsername(username),
      email: checkEmail(email),
      password: checkPassword(password),
    });
    if (Object.keys(errors).length) return sendInvalid(res, errors);

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username.trim();

    // Check if email already registered
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "This email address is already registered. Please log in.",
      });
    }

    // Check if username is already taken
    const existingUsername = await User.findOne({ username: cleanUsername });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: "This username is already taken. Please choose another.",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
    });

    const token = generateToken(newUser._id);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        _id: newUser._id,
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        bestTime: newUser.bestTime,
        currentTime: newUser.currentTime,
        average: newUser.average,
        solvesCount: newUser.solvesCount,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That email or username is already registered.",
      });
    }
    console.error("Register error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while registering user.",
    });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // the email field may carry an email or a username
    if (
      typeof email !== "string" || !email.trim() || email.length > 254 ||
      typeof password !== "string" || !password || password.length > 72
    ) {
      return sendInvalid(res, { email: "Please provide your email/username and password." });
    }

    const cleanInput = email.toLowerCase().trim();

    // Support login via email or username
    const user = await User.findOne({
      $or: [{ email: cleanInput }, { username: email.trim() }],
    });

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({
        success: false,
        message: "Invalid email/username or password.",
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/username or password.",
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        bestTime: user.bestTime,
        currentTime: user.currentTime,
        average: user.average,
        solvesCount: user.solvesCount,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while logging in.",
    });
  }
};

// @desc    Change password (invalidates all older tokens, returns a fresh one)
// @route   PUT /api/auth/password
// @access  Private
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 72) {
      return sendInvalid(res, { currentPassword: "Please enter your current password." });
    }
    const newError = checkPassword(newPassword);
    if (newError) return sendInvalid(res, { newPassword: newError });
    if (newPassword === currentPassword) {
      return sendInvalid(res, { newPassword: "New password must be different from the current one." });
    }

    const user = await User.findById(req.user._id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return sendInvalid(res, { currentPassword: "Current password is incorrect." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    // iat has 1s resolution: floor so the token issued below is still accepted
    user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while changing password.",
    });
  }
};

const RESET_TTL_MS = 30 * 60 * 1000;
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// @desc    Email a password reset link
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const emailError = checkEmail(email);
    if (emailError) return sendInvalid(res, { email: emailError });

    // Same answer whether or not the account exists, so this can't be used to find registered emails.
    const reply = () =>
      res.status(200).json({
        success: true,
        message: "If that email is registered, a reset link has been sent.",
      });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return reply();

    const token = crypto.randomBytes(32).toString("hex");
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS);
    await user.save();

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    // not awaited: mail latency would also reveal whether the account exists
    sendMail({
      to: user.email,
      subject: "Reset your CubeVerse password",
      text: `Hi ${user.username},\n\nUse this link to choose a new password (valid for 30 minutes):\n${clientUrl}/reset-password?token=${token}\n\nIf you didn't ask for this, you can ignore this email.`,
    }).catch((err) => console.error("Reset email failed:", err.message));

    return reply();
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ success: false, message: "Server error while sending reset email." });
  }
};

// @desc    Set a new password using an emailed token
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      return sendInvalid(res, { token: "This reset link is invalid or has expired." });
    }
    const passwordError = checkPassword(newPassword);
    if (passwordError) return sendInvalid(res, { newPassword: passwordError });

    const user = await User.findOne({
      resetTokenHash: hashToken(token),
      resetTokenExpires: { $gt: new Date() },
    }).select("+resetTokenHash +resetTokenExpires");
    if (!user) {
      return sendInvalid(res, { token: "This reset link is invalid or has expired." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000); // revokes existing sessions
    user.resetTokenHash = null;
    user.resetTokenExpires = null;
    await user.save();

    return res.status(200).json({ success: true, message: "Password reset. You can now log in." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ success: false, message: "Server error while resetting password." });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        bestTime: user.bestTime,
        currentTime: user.currentTime,
        average: user.average,
        solvesCount: user.solvesCount,
      },
    });
  } catch (error) {
    console.error("GetMe error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching user profile.",
    });
  }
};
