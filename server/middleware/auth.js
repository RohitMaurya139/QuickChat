import User from "../models/User.js"; // User model for database operations
import jwt from "jsonwebtoken"; // JWT library to verify tokens

// Middleware to protect routes and ensure only authenticated users can access
export const protectRoute = async (req, res, next) => {
  try {
    // Extract token from request headers (expects token to be sent in 'token' header)
    const token = req.headers.token;

    // Verify the JWT token using secret key from environment variables
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Use the decoded payload to find the user in the database by ID, excluding password
    const user = await User.findById(decoded.userId).select("-password");

    // If no user found, send an error response
    if (!user) return res.json({ success: false, message: "User not found" });

    // Attach the user object to the request for use in later middleware/routes
    req.user = user;

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    console.log(error.message);

    // If any error occurs (e.g., invalid token), send failure response
    res.json({ success: false, message: error.message });
  }
};
