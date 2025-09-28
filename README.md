 # QuickChat BackEnd
 ### Server.js

```js
import express from "express";             // Import Express framework to create the server
import "dotenv/config";                    // Load environment variables from .env file
import cors from "cors";                   // Enable Cross-Origin Resource Sharing
import http from "http";                   // Node's HTTP module to create server
import { connectDB } from "./lib/db.js";  // Custom function to connect to MongoDB
import userRouter from "./routes/userRoutes.js";       // User-related API routes
import messageRouter from "./routes/messageRoutes.js"; // Message-related API routes
import { Server } from "socket.io";       // Import Socket.IO server for real-time communication


// Create Express app instance
const app = express();

// Create an HTTP server using the Express app (necessary for socket.io)
const server = http.createServer(app);


// Initialize Socket.IO server and allow CORS from any origin
export const io = new Server(server, {
    cors: { origin: "*" } // Allow requests from any frontend for socket connections
});


// Object to keep track of online users and their socket IDs
export const userSocketMap = {}; // { userId: socketId }


// Setup socket.io connection event handler
io.on("connection", (socket) => {
    // Extract userId sent during socket handshake (connection query)
    const userId = socket.handshake.query.userId;

    console.log("User Connected", userId);

    // Map this user's ID to their socket ID so we can target them with messages
    if (userId) userSocketMap[userId] = socket.id;

    // Emit current list of online users to all connected clients
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // Handle disconnection of this socket
    socket.on("disconnect", () => {
        console.log("User Disconnected", userId);

        // Remove the disconnected user's entry from the map
        delete userSocketMap[userId];

        // Update all clients with the new list of online users
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });
});


// Middleware to parse incoming JSON requests with size limit (4mb)
app.use(express.json({ limit: "4mb" }));

// Middleware to enable CORS for all routes
app.use(cors());


// Basic health check route to verify server status
app.use("/api/status", (req, res) => res.send("Server is live"));

// Routes for authentication and user operations
app.use("/api/auth", userRouter);

// Routes for handling messages (sending, fetching, etc.)
app.use("/api/messages", messageRouter);


// Connect to MongoDB database before starting the server
await connectDB();


// Start the server only in non-production environments (like local dev)
// Use port from environment variables or default to 5000
if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log("Server is running on PORT: " + PORT));
}


// Export the server instance for use by deployment platforms like Vercel
export default server;
```


### Summary

- The code sets up an Express server and attaches an HTTP server for Socket.IO.
- Socket.IO is used for real-time user connection tracking using `userSocketMap` to map user IDs to their socket connections.
- On user connection, their ID is registered and all clients are informed about the currently online users.
- On user disconnect, their ID is removed and clients are updated.
- Middleware handles JSON body parsing and CORS.
- Express routes are set up for authentication and message operations separated in different route files.
- A database connection to MongoDB is established before the server starts.
- The server listens conditionally only in non-production for local development.
- The server is exported for remote deployment platforms like Vercel which may handle starting the server differently.


## UserRouter

```js
import express from "express"; 
import { checkAuth, login, signup, updateProfile } from "../controllers/userController.js";
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
```


### Explanation:

- An Express Router instance is used to modularize user-related API endpoints.
- `signup` and `login` are public POST routes for registration and authentication.
- `update-profile` and `check` routes are private routes guarded by `protectRoute` middleware, which ensures only authenticated users can access them.
- Controllers (`signup`, `login`, `updateProfile`, `checkAuth`) handle the core business logic like creating users, verifying credentials, updating records, and returning user data.
- This setup cleanly separates route definitions from implementation logic and secures sensitive endpoints with middleware.

## UserController

```js
import { generateToken } from "../lib/utils.js"; // Utility to create JWT token
import User from "../models/User.js";             // User model for MongoDB interactions
import bcrypt from "bcryptjs";                     // Library for hashing and verifying passwords
import cloudinary from "../lib/cloudinary.js";    // Cloudinary for image upload


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
            bio
        });

        // Generate a JWT token for the new user session
        const token = generateToken(newUser._id);

        // Send success response including user data and token
        res.json({ success: true, userData: newUser, token, message: "Account created successfully" });
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
```


### Summary:

- **Signup**: Validates input, checks email uniqueness, hashes password, saves new user, and returns JWT token.
- **Login**: Validates credentials, compares hashed passwords, issues JWT token on success.
- **CheckAuth**: Returns current authenticated user's info (set by auth middleware).
- **UpdateProfile**: Updates user's profile picture (uploads to Cloudinary if provided), full name, and bio. Returns updated user info.

##  MessageController

```js
import Message from "../models/Message.js";   // Message model for MongoDB CRUD
import User from "../models/User.js";         // User model to fetch user info
import cloudinary from "../lib/cloudinary.js"; // For uploading images to cloud storage
import { io, userSocketMap } from "../server.js"; // Socket.io server and map of online user sockets


// Get list of all users except the logged-in user for showing in sidebar
export const getUsersForSidebar = async (req, res) => {
    try {
        const userId = req.user._id;

        // Find all users except the authenticated user, exclude password field for security
        const filteredUsers = await User.find({ _id: { $ne: userId } }).select("-password");

        // Object to store count of unseen messages from each user
        const unseenMessages = {};

        // For each user, find number of messages sent by them to the logged-in user that are not yet seen
        const promises = filteredUsers.map(async (user) => {
            const messages = await Message.find({ senderId: user._id, receiverId: userId, seen: false });
            if (messages.length > 0) {
                unseenMessages[user._id] = messages.length;
            }
        });
        await Promise.all(promises);

        // Respond with user list and unseen message counts per user
        res.json({ success: true, users: filteredUsers, unseenMessages });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};


// Get all chat messages between logged-in user and the selected user
export const getMessages = async (req, res) => {
    try {
        const { id: selectedUserId } = req.params;
        const myId = req.user._id;

        // Find messages where sender/receiver are either the logged-in user or the selected user
        const messages = await Message.find({
            $or: [
                { senderId: myId, receiverId: selectedUserId },
                { senderId: selectedUserId, receiverId: myId },
            ]
        });

        // Mark all messages from selected user to logged-in user as 'seen'
        await Message.updateMany({ senderId: selectedUserId, receiverId: myId }, { seen: true });

        res.json({ success: true, messages });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};


// Mark a single message as seen using message ID (used for fine-grained control)
export const markMessageAsSeen = async (req, res) => {
    try {
        const { id } = req.params;
        await Message.findByIdAndUpdate(id, { seen: true });
        res.json({ success: true });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};


// Send a new message to a selected user
export const sendMessage = async (req, res) => {
    try {
        const { text, image } = req.body;
        const receiverId = req.params.id;
        const senderId = req.user._id;

        let imageUrl;
        // If an image is sent with the message, upload it to Cloudinary and get the URL
        if (image) {
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
        }

        // Save the new message to database with sender, receiver, text, and image info
        const newMessage = await Message.create({
            senderId,
            receiverId,
            text,
            image: imageUrl
        });

        // Emit the new message in real-time to the receiver's socket if they are online
        const receiverSocketId = userSocketMap[receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }

        // Respond with the newly created message
        res.json({ success: true, newMessage });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};
```


### Summary:

- **getUsersForSidebar:** Fetches all users except the currently logged-in one, along with counts of their unseen messages to the logged-in user.
- **getMessages:** Retrieves full conversation messages between the logged-in user and a selected user, marking those from the selected user as seen.
- **markMessageAsSeen:** Marks a specific message as seen by ID.
- **sendMessage:** Saves a new message (optionally with image upload), and emits it realtime to the receiver if they are online via socket.io.




```js
import Message from "../models/Message.js";   // MongoDB model for message documents
import User from "../models/User.js";         // MongoDB model for users
import cloudinary from "../lib/cloudinary.js"; // Cloudinary helper to upload images
import { io, userSocketMap } from "../server.js"; // Socket.IO server instance and user-socket map


// Fetch all users except the logged-in user, for sidebar display
export const getUsersForSidebar = async (req, res) => {
    try {
        const userId = req.user._id; // Current logged in user's id

        // Find all users except the logged-in user; exclude password from result
        const filteredUsers = await User.find({ _id: { $ne: userId } }).select("-password");

        // Object to store unseen message counts from each user
        const unseenMessages = {};

        // For each user, fetch count of unseen messages sent to logged-in user
        const promises = filteredUsers.map(async (user) => {
            const messages = await Message.find({
                senderId: user._id,
                receiverId: userId,
                seen: false
            });
            if (messages.length > 0) {
                unseenMessages[user._id] = messages.length;
            }
        });
        await Promise.all(promises);

        res.json({ success: true, users: filteredUsers, unseenMessages });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};


// Fetch all messages exchanged between logged-in user and a selected user
export const getMessages = async (req, res) => {
    try {
        const selectedUserId = req.params.id; // ID of user logged-in user is chatting with
        const myId = req.user._id;

        // Find messages where either user sent/received messages to/from the other
        const messages = await Message.find({
            $or: [
                { senderId: myId, receiverId: selectedUserId },
                { senderId: selectedUserId, receiverId: myId }
            ]
        });

        // Mark all messages received from selected user as seen by logged-in user
        await Message.updateMany({ senderId: selectedUserId, receiverId: myId }, { seen: true });

        res.json({ success: true, messages });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};


// Mark a specific message as seen by message ID (fine-grained control)
export const markMessageAsSeen = async (req, res) => {
    try {
        const { id } = req.params;
        await Message.findByIdAndUpdate(id, { seen: true });
        res.json({ success: true });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};


// Send a new message to a selected user
export const sendMessage = async (req, res) => {
    try {
        const { text, image } = req.body;
        const receiverId = req.params.id; // recipient user ID
        const senderId = req.user._id;    // authenticated sender user ID

        let imageUrl;
        if (image) {
            // Upload image to Cloudinary and get URL
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
        }

        // Create and save new message document in DB
        const newMessage = await Message.create({
            senderId,
            receiverId,
            text,
            image: imageUrl
        });

        // If the receiver is online, emit the new message real-time to their socket
        const receiverSocketId = userSocketMap[receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }

        res.json({ success: true, newMessage });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};
```

Summary:

- Retrieves users for sidebar with unseen message counts.
- Fetches and marks messages as seen in conversations.
- Marks individual messages seen on demand.
- Sends messages with optional images, uploads to Cloudinary, and emits real-time event to the receiver if online.

## ProtectRoute (Auth.js)

```js
import User from "../models/User.js";  // User model for database operations
import jwt from "jsonwebtoken";        // JWT library to verify tokens


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
```


### Summary:

- Extracts a JWT token from the request headers.
- Verifies the token's validity and decodes user info.
- Retrieves user from the database by decoded ID.
- If authenticated, attaches user data to `req.user` and calls `next()` to allow request continuation.
- On failure (invalid token or user not found), sends a failure response.




