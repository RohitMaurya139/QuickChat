import Message from "../models/Message.js"; // Message model for MongoDB CRUD
import User from "../models/User.js"; // User model to fetch user info
import cloudinary from "../lib/cloudinary.js"; // For uploading images to cloud storage
import { io, userSocketMap } from "../server.js"; // Socket.io server and map of online user sockets

// Get list of all users except the logged-in user for showing in sidebar
export const getUsersForSidebar = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all users except the authenticated user, exclude password field for security
    const filteredUsers = await User.find({ _id: { $ne: userId } }).select(
      "-password"
    );

    // Object to store count of unseen messages from each user
    const unseenMessages = {};

    // For each user, find number of messages sent by them to the logged-in user that are not yet seen
    const promises = filteredUsers.map(async (user) => {
      const messages = await Message.find({
        senderId: user._id,
        receiverId: userId,
        seen: false,
      });
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
      ],
    });

    // Mark all messages from selected user to logged-in user as 'seen'
    await Message.updateMany(
      { senderId: selectedUserId, receiverId: myId },
      { seen: true }
    );

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
      image: imageUrl,
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
