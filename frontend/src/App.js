import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

// Connect to the backend server
const socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001');

function App() {
  // User & Auth State
  const [username, setUsername] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // View Management State
  const [currentView, setCurrentView] = useState('login'); // 'login', 'lobby', 'chat'
  const [activeChat, setActiveChat] = useState(null); // e.g. { room: 'user1-user2', withUser: 'user2' }

  // Data State
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]);

  const chatEndRef = useRef(null);

  useEffect(() => {
    // --- Global Listeners ---
    socket.on('update_user_list', (users) => {
      // This listener's closure can have a stale `username` when it's first set up.
      // To get the most up-to-date username for filtering, we can use the functional
      // form of our state setter, which is guaranteed to have the latest state.
      // We pass a function that doesn't actually change the username, but lets us read it.
      setUsername(currentUsername => {
        setOnlineUsers(users.filter((u) => u !== currentUsername));
        return currentUsername;
      });
    });

    socket.on('chat_message', (msg) => {
      // Only add the message if it's for the currently active chat
      if (activeChat && msg.room === activeChat.room) {
        setChat((prevChat) => [...prevChat, msg]);
      }
      // Future enhancement: show a notification for messages in other chats.
    });

    // This listener fires when the server confirms our chat selection
    socket.on('chat_selected', ({ room, withUser, messages }) => {
      setActiveChat({ room, withUser });
      setChat(messages);
      setCurrentView('chat');
    });

    return () => {
      socket.off('update_user_list');
      socket.off('chat_message');
      socket.off('chat_selected');
    };
  }, [username, activeChat]); // Rerun effect if username or activeChat changes

  useEffect(() => {
    // Scroll to the bottom of the chat on new message
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && activeChat) {
      const msgPayload = {
        text: message,
        user: username,
        room: activeChat.room,
      };
      socket.emit('chat_message', msgPayload);
      setMessage('');
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      setIsLoggedIn(true);
      setCurrentView('lobby');
      socket.emit('user_login', username);
    }
  };

  const handleSelectChat = (targetUser) => {
    socket.emit('select_chat', { from: username, to: targetUser });
  };

  const backToLobby = () => {
    setActiveChat(null);
    setCurrentView('lobby');
  };

  // --- Render Methods for Each View ---

  const renderLogin = () => (
    <div className="login-container">
      <form onSubmit={handleLogin}>
        <h1>Enter Your Name</h1>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Your name..."
        />
        <button type="submit">Join Chat</button>
      </form>
    </div>
  );

  const renderLobby = () => (
    <>
      <header className="app-header">
        <h1>Direct Messages</h1>
        <p>Online as: {username}</p>
      </header>
      <div className="user-list">
        {onlineUsers.length > 0 ? (
          onlineUsers.map((user) => (
            <div key={user} className="user-list-item" onClick={() => handleSelectChat(user)}>
              <div className="user-avatar">{user.charAt(0).toUpperCase()}</div>
              <div className="user-name">{user}</div>
            </div>
          ))
        ) : (
          <p className="no-users">No other users are online.</p>
        )}
      </div>
    </>
  );

  const renderChat = () => (
    <>
      <header className="app-header chat-header">
        <button className="back-button" onClick={backToLobby}>&lt;</button>
        <h1>{activeChat?.withUser}</h1>
      </header>
      <div className="chat-window">
        {chat.map((msg) => (
          <div
            key={msg._id} // Use database ID as the key
            className={`message-container ${msg.user === username ? 'sent' : 'received'}`}
          >
            {msg.user !== username && <div className="message-sender">{msg.user}</div>}
            <div className="chat-message">
              <span>{msg.text}</span>
              <span className="message-time">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={sendMessage} className="message-form">
        <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type a message..." />
        <button type="submit">Send</button>
      </form>
    </>
  );

  return (
    <div className="App">
      {currentView === 'login' && renderLogin()}
      {currentView === 'lobby' && renderLobby()}
      {currentView === 'chat' && renderChat()}
    </div>
  );
}

export default App;