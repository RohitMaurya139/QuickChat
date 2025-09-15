import express from "express"; // Import Express framework to create the server
import "dotenv/config"; // Load environment variables from .env file
import cors from "cors"; // Enable Cross-Origin Resource Sharing
import http from "http"; // Node's HTTP module to create server
import { connectDB } from "./lib/db.js"; // Custom function to connect to MongoDB
import userRouter from "./routes/userRoutes.js"; // User-related API routes
import messageRouter from "./routes/messageRoutes.js"; // Message-related API routes
import { Server } from "socket.io"; // Import Socket.IO server for real-time communication

// Create Express app instance
const app = express();

// Create an HTTP server using the Express app (necessary for socket.io)
const server = http.createServer(app);

// Initialize Socket.IO server and allow CORS from any origin
export const io = new Server(server, {
  cors: { origin: "*" }, // Allow requests from any frontend for socket connections
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
