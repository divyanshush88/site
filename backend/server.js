const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(cors()); // Enable Cross-Origin Resource Sharing

// --- Serve Static Frontend Files ---
// This tells Express to serve the static files (like index.html, css, js)
// from the 'build' directory of the frontend.
app.use(express.static(path.join(__dirname, '../frontend/build')));

const server = http.createServer(app);

// Initialize a new instance of socket.io by passing the server object
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:57950", "http://10.108.84.99:57950", "https://site-4-ljwe.onrender.com", "https://your-backend-app.onrender.com"],
    methods: ["GET", "POST"]
  }
});

// --- In-memory store for online users ---
const onlineUsers = {}; // Maps username to socket.id

const MessageSchema = new mongoose.Schema({
  text: String,
  user: String,
  room: { type: String, required: true, index: true }, // Add room identifier
}, { timestamps: true }); // timestamps: true adds createdAt and updatedAt

const Message = mongoose.model('Message', MessageSchema);

const PORT = process.env.PORT || 3001;

// --- Catch-all for Frontend Routing ---
// For any request that doesn't match a static file,
// send back the main index.html file. This is crucial for Single Page Applications.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// --- Database and Server Startup ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://divyanshush88:ds3465797@cluster022.ekdup.mongodb.net/';
mongoose.connect(MONGODB_URI).then(() => {
  console.log('✅ MongoDB connected successfully.');
  server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('🔴 Database connection failed. Server not started.', err);
  process.exit(1); // Exit the process if DB connection fails
});

// Listen for a connection event
io.on('connection', async (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // --- User Login ---
  socket.on('user_login', (username) => {
    onlineUsers[username] = socket.id;
    socket.username = username; // Attach username to the socket for easy access on disconnect
    // Broadcast updated user list to everyone
    io.emit('update_user_list', Object.keys(onlineUsers));
    console.log(`${username} logged in.`);
  });

  // --- User selects a chat to open ---
  socket.on('select_chat', async ({ from, to }) => {
    // Create a consistent, unique room name for any pair of users
    const roomName = [from, to].sort().join('-');
    
    // Make the current user join the room
    socket.join(roomName);

    // Load message history for this specific room
    const messages = await Message.find({ room: roomName }).sort({ createdAt: 'asc' });

    // Send confirmation, room details, and history back to the user
    socket.emit('chat_selected', { room: roomName, withUser: to, messages });
  });

  // Listen for a 'chat_message' event from a client
  socket.on('chat_message', async (msg) => {
    // msg now contains { text, user, room }
    
    // Create a new message document
    const newMessage = new Message({
      text: msg.text,
      user: msg.user,
      room: msg.room,
    });
    try {
      // Save the message to the database
      const savedMessage = await newMessage.save();
      // Broadcast the saved message ONLY to clients in that specific room
      io.to(msg.room).emit('chat_message', savedMessage);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  // Listen for a disconnection event
  socket.on('disconnect', () => {
    if (socket.username) {
      delete onlineUsers[socket.username];
      // Broadcast the updated user list to all remaining clients
      io.emit('update_user_list', Object.keys(onlineUsers));
      console.log(`User ${socket.username} disconnected`);
    }
  });
});