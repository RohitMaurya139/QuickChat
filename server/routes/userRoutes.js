import express from "express";
import {
  checkAuth,
  login,
  signup,
  updateProfile,
} from "../controllers/userController.js";
import { protectRoute } from "../middleware/auth.js";

// Create an Express router instance to hold user-related routes
const userRouter = express.Router();

// Route for user signup - publicly accessible
// Calls signup controller to handle registration logic
userRouter.post("/signup", signup);

// Route for user login - publicly accessible
// Calls login controller to handle authentication and token generation
userRouter.post("/login", login);

// Route for updating user profile - protected route
// Only authenticated users can access this by passing the protectRoute middleware
// Calls updateProfile controller for profile updates
userRouter.put("/update-profile", protectRoute, updateProfile);

// Route to check user authentication status - protected route
// Only accessible by authenticated users, returns user info if logged in
userRouter.get("/check", protectRoute, checkAuth);

// Export the router so it can be used in the main Express app
export default userRouter;
