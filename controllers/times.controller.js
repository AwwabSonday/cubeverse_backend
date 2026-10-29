import TimeLog from "../models/timeLog.models.js";
import User from "../models/user.models.js";
import mongoose from "mongoose";
import { checkCategory, sendInvalid } from "../utils/validate.js";

const MAX_SOLVE_SECONDS = 86400;
const MAX_SCRAMBLE_LENGTH = 500;

// Helper to calculate statistics from a list of logs
const calculateStats = (logs) => {
  if (!logs || logs.length === 0) {
    return {
      currentTime: null,
      bestTime: null,
      average: null,
      solvesCount: 0,
    };
  }

  const times = logs.map((log) => Number(log.time)).filter((t) => !isNaN(t) && t > 0);

  if (times.length === 0) {
    return {
      currentTime: null,
      bestTime: null,
      average: null,
      solvesCount: 0,
    };
  }

  // Logs are sorted newest first, so currentTime is the first element
  const currentTime = Number(logs[0].time);
  const bestTime = Math.min(...times);
  const total = times.reduce((acc, t) => acc + t, 0);
  const average = Number((total / times.length).toFixed(2));

  return {
    currentTime,
    bestTime: Number(bestTime.toFixed(2)),
    average,
    solvesCount: times.length,
  };
};

// @desc    Get user's times, average, best time, current time, and time logs
// @route   GET /api/times
// @access  Private
export const getTimes = async (req, res) => {
  try {
    const userId = req.user._id;
    const category = req.query.category ?? "3x3";
    const categoryError = checkCategory(category, { allowAll: true });
    if (categoryError) return sendInvalid(res, { category: categoryError });

    const query = { userId };
    if (category && category !== "all") {
      query.category = category;
    }

    const timeLogs = await TimeLog.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const stats = calculateStats(timeLogs);

    return res.status(200).json({
      success: true,
      category,
      currentTime: stats.currentTime,
      bestTime: stats.bestTime,
      average: stats.average,
      solvesCount: stats.solvesCount,
      timeLogs,
    });
  } catch (error) {
    console.error("getTimes error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user times.",
    });
  }
};

// @desc    Save a new solve time
// @route   POST /api/times
// @access  Private
export const saveTime = async (req, res) => {
  try {
    const userId = req.user._id;
    const { time, scramble, category = "3x3" } = req.body;

    const numericTime = typeof time === "number" ? time : Number.NaN;
    if (!Number.isFinite(numericTime) || numericTime <= 0 || numericTime > MAX_SOLVE_SECONDS) {
      return sendInvalid(res, { time: "A valid positive solve time is required." });
    }
    const categoryError = checkCategory(category);
    if (categoryError) return sendInvalid(res, { category: categoryError });
    if (scramble !== undefined && (typeof scramble !== "string" || scramble.length > MAX_SCRAMBLE_LENGTH)) {
      return sendInvalid(res, { scramble: `Scramble must be text up to ${MAX_SCRAMBLE_LENGTH} characters.` });
    }

    // Create the new solve log
    const newLog = await TimeLog.create({
      userId,
      time: Number(numericTime.toFixed(2)),
      scramble: typeof scramble === "string" ? scramble : "",
      category,
    });

    // Query updated logs to recompute stats
    const query = { userId };
    if (category && category !== "all") {
      query.category = category;
    }

    const timeLogs = await TimeLog.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const stats = calculateStats(timeLogs);

    // Also update overall stats on user document
    await User.findByIdAndUpdate(userId, {
      currentTime: stats.currentTime,
      bestTime: stats.bestTime,
      average: stats.average,
      solvesCount: stats.solvesCount,
    });

    return res.status(201).json({
      success: true,
      message: "Time saved successfully",
      newLog,
      currentTime: stats.currentTime,
      bestTime: stats.bestTime,
      average: stats.average,
      solvesCount: stats.solvesCount,
      timeLogs,
    });
  } catch (error) {
    console.error("saveTime error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save solve time.",
    });
  }
};

// @desc    Delete a specific solve log
// @route   DELETE /api/times/:id
// @access  Private
export const deleteTime = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return sendInvalid(res, { id: "Invalid solve id." });
    }
    const category = req.query.category ?? "3x3";
    const categoryError = checkCategory(category, { allowAll: true });
    if (categoryError) return sendInvalid(res, { category: categoryError });

    const log = await TimeLog.findOneAndDelete({ _id: id, userId });
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Solve time log not found or unauthorized.",
      });
    }

    // Query remaining logs
    const query = { userId };
    if (category && category !== "all") {
      query.category = category;
    }

    const timeLogs = await TimeLog.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const stats = calculateStats(timeLogs);

    await User.findByIdAndUpdate(userId, {
      currentTime: stats.currentTime,
      bestTime: stats.bestTime,
      average: stats.average,
      solvesCount: stats.solvesCount,
    });

    return res.status(200).json({
      success: true,
      message: "Solve deleted successfully",
      currentTime: stats.currentTime,
      bestTime: stats.bestTime,
      average: stats.average,
      solvesCount: stats.solvesCount,
      timeLogs,
    });
  } catch (error) {
    console.error("deleteTime error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete time log.",
    });
  }
};

// @desc    Reset all solves for user
// @route   DELETE /api/times/reset
// @access  Private
export const resetTimes = async (req, res) => {
  try {
    const userId = req.user._id;
    const category = req.query.category ?? "3x3";
    const categoryError = checkCategory(category, { allowAll: true });
    if (categoryError) return sendInvalid(res, { category: categoryError });

    const query = { userId };
    if (category && category !== "all") {
      query.category = category;
    }

    await TimeLog.deleteMany(query);

    // Update user stats
    await User.findByIdAndUpdate(userId, {
      currentTime: null,
      bestTime: null,
      average: null,
      solvesCount: 0,
    });

    return res.status(200).json({
      success: true,
      message: "Session times reset successfully",
      currentTime: null,
      bestTime: null,
      average: null,
      solvesCount: 0,
      timeLogs: [],
    });
  } catch (error) {
    console.error("resetTimes error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset times.",
    });
  }
};
