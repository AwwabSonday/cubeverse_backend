import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    // tokens issued before this moment are rejected (set on password change)
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    // sha256 of the emailed reset token; the raw token is never stored
    resetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    resetTokenExpires: {
      type: Date,
      default: null,
      select: false,
    },
    phone: {
      type: String,
      required: false,
      default: "",
    },
    // Overall user stats
    currentTime: {
      type: Number,
      default: null,
    },
    bestTime: {
      type: Number,
      default: null,
    },
    average: {
      type: Number,
      default: null,
    },
    solvesCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
export const user = User;
export default User;
