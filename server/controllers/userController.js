import { generateToken } from "../lib/utils.js"; // Utility to create JWT token
import User from "../models/User.js"; // User model for MongoDB interactions
import bcrypt from "bcryptjs"; // Library for hashing and verifying passwords
import cloudinary from "../lib/cloudinary.js"; // Cloudinary for image upload

// Signup controller to register a new user
export const signup = async (req, res) => {
  const { fullName, email, password, bio } = req.body;

  try {
    // Check if any required field is missing
    if (!fullName || !email || !password || !bio) {
      return res.json({ success: false, message: "Missing Details" });
    }

    // Check if a user with this email already exists
    const user = await User.findOne({ email });

    if (user) {
      return res.json({ success: false, message: "Account already exists" });
    }

    // Generate salt and hash the plain password for secure storage
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user document with hashed password
    const newUser = await User.create({
      fullName,
      email,
      password: hashedPassword,
      bio,
    });

    // Generate a JWT token for the new user session
    const token = generateToken(newUser._id);

    // Send success response including user data and token
    res.json({
      success: true,
      userData: newUser,
      token,
      message: "Account created successfully",
    });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

// Login controller for existing users
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const userData = await User.findOne({ email });

    // Compare provided password with hashed password stored in DB
    const isPasswordCorrect = await bcrypt.compare(password, userData.password);

    // If password does not match, reject with an error
    if (!isPasswordCorrect) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    // Generate JWT token for this user session
    const token = generateToken(userData._id);

    // Respond with user info and token on successful login
    res.json({ success: true, userData, token, message: "Login successful" });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

// Check if user is authenticated middleware endpoint
// Response returns authenticated user info from request (set by protectRoute middleware)
export const checkAuth = (req, res) => {
  res.json({ success: true, user: req.user });
};

// Update profile controller to modify user's profile info
export const updateProfile = async (req, res) => {
  try {
    const { profilePic, bio, fullName } = req.body;
    const userId = req.user._id; // User ID extracted from authenticated request
    let updatedUser;

    // If no profile picture update, just update bio and full name
    if (!profilePic) {
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { bio, fullName },
        { new: true } // Return the updated document
      );
    } else {
      // Upload the new profile picture to Cloudinary and get the URL
      const upload = await cloudinary.uploader.upload(profilePic);

      // Update user document with new profile picture URL, bio, and full name
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { profilePic: upload.secure_url, bio, fullName },
        { new: true }
      );
    }

    // Respond with updated user data
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};
