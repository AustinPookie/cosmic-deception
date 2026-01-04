const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Security middleware - Content Security Policy (relaxed for development)
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'unsafe-hashes'; script-src-attr 'unsafe-inline'; connect-src 'self' https: wss:; img-src 'self' data: https:;");
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const rooms = new Map();
const playerSockets = new Map();

// Map configurations
// Map dimensions define the game world size in pixels
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 1200;

const maps = {
  'skeld': {
    name: 'The Skeld',
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    spawnPoints: [
      { x: 800, y: 600 },  // Cafeteria
      { x: 400, y: 300 },  // Admin
      { x: 1200, y: 300 }, // Navigation
      { x: 400, y: 900 },  // Shields
      { x: 1200, y: 900 }  // Storage
    ],
    walls: [
      // Outer walls
      { x: 0, y: 0, width: 1600, height: 20 },
      { x: 0, y: 1180, width: 1600, height: 20 },
      { x: 0, y: 0, width: 20, height: 1200 },
      { x: 1580, y: 0, width: 20, height: 1200 },
      
      // Cafeteria walls
      { x: 600, y: 400, width: 20, height: 400 },
      { x: 1000, y: 400, width: 20, height: 400 },
      
      // Admin walls
      { x: 200, y: 200, width: 400, height: 20 },
      { x: 200, y: 200, width: 20, height: 200 },
      
      // Navigation walls
      { x: 1000, y: 100, width: 20, height: 300 },
      { x: 1200, y: 100, width: 300, height: 20 },
      
      // Shields walls
      { x: 200, y: 800, width: 20, height: 300 },
      { x: 200, y: 800, width: 300, height: 20 },
      
      // Storage walls
      { x: 1300, y: 700, width: 20, height: 400 },
      { x: 1300, y: 700, width: 300, height: 20 },
      
      // Reactor walls
      { x: 700, y: 100, width: 20, height: 200 },
      { x: 900, y: 100, width: 20, height: 200 },
      
      // Electrical walls
      { x: 700, y: 900, width: 200, height: 20 },
      { x: 700, y: 900, width: 20, height: 200 },
      
      // Medbay walls
      { x: 400, y: 500, width: 200, height: 20 }
    ],
    tasks: [
      { id: 'fix_wires', name: 'Fix Wires', x: 300, y: 200, type: 'short' },
      { id: 'fuel_engine', name: 'Fuel Engine', x: 1000, y: 800, type: 'long' },
      { id: 'clean_filter', name: 'Clean Filter', x: 600, y: 400, type: 'medium' },
      { id: 'align_output', name: 'Align Output', x: 1300, y: 200, type: 'short' },
      { id: 'divert_power', name: 'Divert Power', x: 500, y: 1000, type: 'medium' }
    ],
    vents: [
      { x: 400, y: 400 },
      { x: 1200, y: 400 },
      { x: 400, y: 800 },
      { x: 1200, y: 800 }
    ]
  }
};

// Player colors
const PLAYER_COLORS = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#FFA500', '#800080', '#008000', '#000080', '#FFC0CB', '#A52A2A',
  '#808080', '#000000', '#4B0082', '#40E0D0', '#FA8072', '#EE82EE',
  '#FFD700', '#ADFF2F'
];

// Game phases
const PHASE = {
  LOBBY: 'lobby',
  TASKS: 'tasks',
  MEETING: 'meeting',
  GAME_OVER: 'game_over'
};

// Helper functions
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function assignRoles(numPlayers) {
  const numImposters = numPlayers <= 5 ? 1 : numPlayers <= 8 ? 2 : 3;
  const roles = Array(numPlayers).fill('crewmate');
  
  for (let i = 0; i < numImposters; i++) {
    roles[i] = 'imposter';
  }
  
  // Shuffle roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  
  return roles;
}

function createRoom(hostSocketId, settings = {}) {
  const roomCode = generateRoomCode();
  const room = {
    code: roomCode,
    host: hostSocketId,
    players: new Map(),
    gameState: {
      phase: PHASE.LOBBY,
      imposters: [],
      crewmates: [],
      tasks: [],
      meetingActive: false,
      votes: {},
      bodyReported: false,
      emergencyCalled: false,
      taskProgress: 0,
      totalTasks: 0,
      map: settings.map || 'skeld'
    },
    settings: {
      ...settings,
      maxPlayers: settings.maxPlayers || 20,
      killCooldown: settings.killCooldown || 30,
      taskBar: settings.taskBar || 'always',
      emergencyCooldown: settings.emergencyCooldown || 15,
      discussionTime: settings.discussionTime || 30,
      votingTime: settings.votingTime || 30
    }
  };
  
  rooms.set(roomCode, room);
  return room;
}

function resetGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const mapConfig = maps[room.gameState.map];
  const spawnIndex = Math.floor(Math.random() * mapConfig.spawnPoints.length);
  
  // Assign roles
  const roles = assignRoles(room.players.size);
  const playerArray = Array.from(room.players.values());
  
  room.gameState.imposters = [];
  room.gameState.crewmates = [];
  room.gameState.tasks = [];
  
  playerArray.forEach((player, index) => {
    player.role = roles[index];
    player.isAlive = true;
    player.x = mapConfig.spawnPoints[index % mapConfig.spawnPoints.length].x;
    player.y = mapConfig.spawnPoints[index % mapConfig.spawnPoints.length].y;
    player.completedTasks = 0;
    player.votedFor = null;
    
    if (player.role === 'imposter') {
      room.gameState.imposters.push(player.id);
    } else {
      room.gameState.crewmates.push(player.id);
      // Assign random tasks to crewmates
      const numTasks = 3 + Math.floor(Math.random() * 3); // 3-5 tasks per crewmate
      for (let i = 0; i < numTasks; i++) {
        const task = { ...mapConfig.tasks[Math.floor(Math.random() * mapConfig.tasks.length)] };
        task.assignedTo = player.id;
        task.completed = false;
        room.gameState.tasks.push(task);
      }
    }
  });
  
  // FIX: Properly count crewmate tasks by looking up player roles
  room.gameState.totalTasks = room.gameState.tasks.filter(t => {
    const player = room.players.get(t.assignedTo);
    return player && player.role !== 'imposter';
  }).length;
  
  room.gameState.phase = PHASE.TASKS;
  room.gameState.meetingActive = false;
  room.gameState.votes = {};
  room.gameState.bodyReported = false;
  room.gameState.emergencyCalled = false;
  
  // Reset impostor kill cooldowns
  room.gameState.imposterKillCooldowns = {};
  room.gameState.imposters.forEach(id => {
    room.gameState.imposterKillCooldowns[id] = 0;
  });
  
  return room;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Create room
  socket.on('createRoom', (settings, callback) => {
    const room = createRoom(socket.id, settings);
    socket.join(room.code);
    
    if (typeof callback === 'function') {
      callback({ 
        success: true, 
        roomCode: room.code,
        settings: room.settings
      });
    }
    
    // Also emit the room code to all sockets in the room
    socket.to(room.code).emit('roomCreated', { roomCode: room.code });
    
    console.log(`Room created: ${room.code}`);
  });
  
  // Join room
  socket.on('joinRoom', ({ roomCode, playerName, color }, callback) => {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Room not found' });
      }
      return;
    }
    
    if (room.players.size >= room.settings.maxPlayers) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Room is full' });
      }
      return;
    }
    
    if (room.gameState.phase !== PHASE.LOBBY) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Game already in progress' });
      }
      return;
    }
    
    // Validate and sanitize player name
    const sanitizedName = (playerName || '').trim().slice(0, 15);
    if (sanitizedName.length === 0) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Player name cannot be empty' });
      }
      return;
    }
    
    // Check for malicious content
    const offensivePatterns = /<script|javascript:|data:/i;
    if (offensivePatterns.test(sanitizedName)) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Invalid player name' });
      }
      return;
    }
    
    const playerId = uuidv4();
    const player = {
      id: playerId,
      socketId: socket.id,
      name: sanitizedName,
      color: color || PLAYER_COLORS[room.players.size % PLAYER_COLORS.length],
      role: 'crewmate',
      isAlive: true,
      x: 800 + (Math.random() - 0.5) * 200,
      y: 600 + (Math.random() - 0.5) * 200,
      completedTasks: 0,
      votedFor: null,
      peerId: null // For WebRTC voice
    };
    
    room.players.set(playerId, player);
    playerSockets.set(socket.id, { roomCode: room.code, playerId });
    socket.join(room.code);
    
    // Notify others
    socket.to(room.code).emit('playerJoined', player);
    
    // Send current players to new player
    const playersList = Array.from(room.players.values());
    socket.emit('roomJoined', {
      success: true,
      playerId,
      roomCode: room.code,
      players: playersList,
      host: room.host,
      settings: room.settings,
      map: room.gameState.map
    });
    
    if (typeof callback === 'function') {
      callback({ success: true, playerId });
    }
    
    console.log(`Player ${player.name} joined room ${room.code}`);
  });
  
  // Update player info (name, color)
  socket.on('updatePlayer', (updates, callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Not in a room' });
      }
      return;
    }
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    
    if (!player) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Player not found' });
      }
      return;
    }
    
    Object.assign(player, updates);
    
    // Notify others
    socket.to(data.roomCode).emit('playerUpdated', { playerId: data.playerId, updates });
    
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });
  
  // Voice: Set peer ID
  socket.on('setPeerId', (peerId) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    
    if (player) {
      player.peerId = peerId;
      io.to(data.roomCode).emit('peerIdUpdated', { playerId: data.playerId, peerId });
    }
  });
  
  // Get voice peers in room
  socket.on('getVoicePeers', (callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Not in a room' });
      }
      return;
    }
    
    const room = rooms.get(data.roomCode);
    const peers = [];
    
    room.players.forEach((player) => {
      if (player.id !== data.playerId && player.peerId && player.isAlive) {
        peers.push({
          playerId: player.id,
          peerId: player.peerId,
          name: player.name
        });
      }
    });
    
    if (typeof callback === 'function') {
      callback({ success: true, peers });
    }
  });
  
  // Start game
  socket.on('startGame', (callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Not in a room' });
      }
      return;
    }
    
    const room = rooms.get(data.roomCode);
    
    if (room.host !== socket.id) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Only host can start game' });
      }
      return;
    }
    
    if (room.players.size < 4) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Need at least 4 players' });
      }
      return;
    }
    
    resetGame(data.roomCode);
    
    // Notify all players
    io.to(data.roomCode).emit('gameStarted', {
      players: Array.from(room.players.values()),
      tasks: room.gameState.tasks,
      imposters: room.gameState.imposters,
      totalTasks: room.gameState.totalTasks
    });
    
    if (typeof callback === 'function') {
      callback({ success: true });
    }
    
    console.log(`Game started in room ${data.roomCode}`);
  });
  
  // Player movement
  socket.on('playerMove', (movement) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    
    if (!player || !player.isAlive || room.gameState.phase !== PHASE.TASKS) return;
    
    // Update position
    player.x = Math.max(0, Math.min(maps[room.gameState.map].width, movement.x));
    player.y = Math.max(0, Math.min(maps[room.gameState.map].height, movement.y));
    
    // Broadcast to others
    socket.to(data.roomCode).emit('playerMoved', {
      playerId: data.playerId,
      x: player.x,
      y: player.y
    });
  });
  
  // Report body
  socket.on('reportBody', (callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    
    if (!player || !player.isAlive || room.gameState.bodyReported) {
      if (typeof callback === 'function') callback({ success: false, message: 'Cannot report body' });
      return;
    }
    
    // Check if player is near a dead body
    const deadBodyNearby = Array.from(room.players.values()).some(p => 
      !p.isAlive && p.role !== 'imposter' &&
      Math.abs(p.x - player.x) < 60 && Math.abs(p.y - player.y) < 60
    );
    
    if (!deadBodyNearby) {
      if (typeof callback === 'function') callback({ success: false, message: 'No body nearby' });
      return;
    }
    
    room.gameState.bodyReported = true;
    room.gameState.meetingActive = true;
    room.gameState.phase = PHASE.MEETING;
    
    // Reset votes
    room.gameState.votes = {};
    room.players.forEach((p) => {
      p.votedFor = null;
    });
    
    io.to(data.roomCode).emit('meetingCalled', {
      type: 'body',
      reportedBy: data.playerId,
      discussionTime: room.settings.discussionTime,
      votingTime: room.settings.votingTime
    });
    
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });
  
  // Emergency meeting with rate limiting
  const emergencyRateLimit = new Map();
  const EMERGENCY_COOLDOWN = 10000; // 10 seconds between emergency calls

  socket.on('emergencyMeeting', (callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    // Check emergency rate limit
    const now = Date.now();
    const lastEmergency = emergencyRateLimit.get(socket.id) || 0;
    if (now - lastEmergency < EMERGENCY_COOLDOWN) {
      if (typeof callback === 'function') callback({ success: false, message: 'Emergency cooldown active' });
      return;
    }
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    
    if (!player || !player.isAlive || room.gameState.emergencyCalled) {
      if (typeof callback === 'function') callback({ success: false, message: 'Emergency cooldown active' });
      return;
    }
    
    emergencyRateLimit.set(socket.id, now);
    
    room.gameState.emergencyCalled = true;
    room.gameState.meetingActive = true;
    room.gameState.phase = PHASE.MEETING;
    
    // Reset votes
    room.gameState.votes = {};
    room.players.forEach((p) => {
      p.votedFor = null;
    });
    
    io.to(data.roomCode).emit('meetingCalled', {
      type: 'emergency',
      calledBy: data.playerId,
      discussionTime: room.settings.discussionTime,
      votingTime: room.settings.votingTime
    });
    
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });
  
  // Rate limiting for votes
  const voteRateLimit = new Map();
  const VOTE_COOLDOWN = 1000; // 1 second between votes

  // Vote
  socket.on('vote', (targetId, callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    // Check rate limit
    const now = Date.now();
    const lastVote = voteRateLimit.get(socket.id) || 0;
    if (now - lastVote < VOTE_COOLDOWN) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Vote too fast' });
      }
      return;
    }
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    
    if (!player || !player.isAlive || !room.gameState.meetingActive) return;
    
    // Validate vote target
    if (targetId !== 'skip' && targetId !== null) {
      const targetPlayer = room.players.get(targetId);
      if (!targetPlayer || !targetPlayer.isAlive) {
        // Log suspicious activity for server-side monitoring
        // This helps identify potential cheating attempts
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Suspicious vote attempt from ${player.name} in room ${data.roomCode}: invalid target`);
        }
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Invalid vote target' });
        }
        return;
      }
    }
    
    voteRateLimit.set(socket.id, now);
    
    player.votedFor = targetId;
    room.gameState.votes[player.id] = targetId;
    
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });
  
  // Skip vote
  socket.on('skipVote', (callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    // Check rate limit
    const now = Date.now();
    const lastVote = voteRateLimit.get(socket.id) || 0;
    if (now - lastVote < VOTE_COOLDOWN) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Vote too fast' });
      }
      return;
    }
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    
    if (!player || !player.isAlive || !room.gameState.meetingActive) return;
    
    voteRateLimit.set(socket.id, now);
    
    player.votedFor = 'skip';
    room.gameState.votes[player.id] = 'skip';
    
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });
  
  // Complete task
  socket.on('completeTask', (taskId, callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    
    if (!player || !player.isAlive || player.role === 'imposter') return;
    
    const task = room.gameState.tasks.find(t => t.id === taskId && t.assignedTo === player.id);
    if (task && !task.completed) {
      task.completed = true;
      player.completedTasks++;
      
      const completedTasks = room.gameState.tasks.filter(t => t.completed && t.assignedTo !== 'imposter').length;
      room.gameState.taskProgress = completedTasks;
      
      io.to(data.roomCode).emit('taskCompleted', {
        playerId: data.playerId,
        taskId,
        progress: room.gameState.taskProgress,
        totalTasks: room.gameState.totalTasks
      });
      
      // Check win condition
      if (room.gameState.taskProgress >= room.gameState.totalTasks) {
        room.gameState.phase = PHASE.GAME_OVER;
        io.to(data.roomCode).emit('gameOver', {
          winners: 'crewmates',
          reason: 'All tasks completed'
        });
      }
    }
    
    if (typeof callback === 'function') {
      callback({ success: !!task });
    }
  });
  
  // Imposter kill
  socket.on('killPlayer', (targetId, callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    const target = room.players.get(targetId);
    
    if (!player || player.role !== 'imposter' || !player.isAlive) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Cannot kill' });
      }
      return;
    }
    
    // Validate target exists and is alive
    if (!target || !target.isAlive || target.role === 'imposter') {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Invalid target' });
      }
      return;
    }
    
    // Check kill cooldown
    const cooldown = room.gameState.imposterKillCooldowns[player.id] || 0;
    if (Date.now() / 1000 - cooldown < room.settings.killCooldown) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Kill cooldown active' });
      }
      return;
    }
    
    // Check distance (simplified - should check actual distance on server)
    const dx = player.x - target.x;
    const dy = player.y - target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 150) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Target too far' });
      }
      return;
    }
    
    // Kill the target
    target.isAlive = false;
    room.gameState.imposterKillCooldowns[player.id] = Date.now() / 1000;
    
    io.to(data.roomCode).emit('playerKilled', {
      playerId: targetId,
      killerId: data.playerId
    });
    
    // Check if only imposters remain
    const aliveImposters = room.gameState.imposters.filter(id => {
      const p = room.players.get(id);
      return p && p.isAlive;
    });
    
    const aliveCrewmates = room.gameState.crewmates.filter(id => {
      const p = room.players.get(id);
      return p && p.isAlive;
    });
    
    if (aliveImposters.length >= aliveCrewmates.length) {
      room.gameState.phase = PHASE.GAME_OVER;
      io.to(data.roomCode).emit('gameOver', {
        winners: 'imposters',
        reason: 'Imposters outnumber crewmates'
      });
    }
    
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });
  
  // Sabotage
  socket.on('sabotage', (type, callback) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    const room = rooms.get(data.roomCode);
    const player = room.players.get(data.playerId);
    
    if (!player || player.role !== 'imposter' || !player.isAlive) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Cannot sabotage' });
      }
      return;
    }
    
    io.to(data.roomCode).emit('sabotageStarted', {
      type,
      imposterId: data.playerId
    });
    
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });
  
  // End meeting
  socket.on('endMeeting', (results) => {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    const room = rooms.get(data.roomCode);
    
    room.gameState.meetingActive = false;
    room.gameState.phase = PHASE.TASKS;
    room.gameState.bodyReported = false;
    room.gameState.emergencyCalled = false;
    
    // Reset all votes
    room.gameState.votes = {};
    room.players.forEach((p) => {
      p.votedFor = null;
    });
    
    // Respawn all alive players at random spawn points
    const mapConfig = maps[room.gameState.map];
    room.players.forEach((player) => {
      if (player.isAlive) {
        const spawnPoint = mapConfig.spawnPoints[Math.floor(Math.random() * mapConfig.spawnPoints.length)];
        player.x = spawnPoint.x + (Math.random() - 0.5) * 100;
        player.y = spawnPoint.y + (Math.random() - 0.5) * 100;
      }
    });
    
    io.to(data.roomCode).emit('meetingEnded', results);
  });
  
  // Leave room
  socket.on('leaveRoom', () => {
    handleDisconnect(socket);
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handleDisconnect(socket);
  });
  
  function handleDisconnect(socket) {
    const data = playerSockets.get(socket.id);
    if (!data) return;
    
    const room = rooms.get(data.roomCode);
    if (!room) return;
    
    const player = room.players.get(data.playerId);
    
    // Remove player
    room.players.delete(data.playerId);
    playerSockets.delete(socket.id);
    socket.leave(data.roomCode);
    
    // Notify others
    socket.to(data.roomCode).emit('playerLeft', { playerId: data.playerId });
    
    // If host left, assign new host or dissolve room
    if (room.host === socket.id) {
      if (room.players.size > 0) {
        const newHost = room.players.values().next().value;
        room.host = newHost.socketId;
        io.to(data.roomCode).emit('hostChanged', { newHostId: newHost.id });
      } else {
        rooms.delete(data.roomCode);
        console.log(`Room ${data.roomCode} dissolved`);
      }
    }
    
    // If game in progress and player was alive, handle appropriately
    if (room.gameState.phase !== PHASE.LOBBY && player && player.isAlive) {
      if (player.role === 'imposter') {
        room.gameState.imposters = room.gameState.imposters.filter(id => id !== data.playerId);
      } else {
        room.gameState.crewmates = room.gameState.crewmates.filter(id => id !== data.playerId);
      }
      
      // Check win conditions
      const aliveImposters = room.gameState.imposters.filter(id => {
        const p = room.players.get(id);
        return p && p.isAlive;
      }).length;
      
      const aliveCrewmates = room.gameState.crewmates.filter(id => {
        const p = room.players.get(id);
        return p && p.isAlive;
      }).length;
      
      if (aliveImposters === 0) {
        room.gameState.phase = PHASE.GAME_OVER;
        io.to(data.roomCode).emit('gameOver', { winners: 'crewmates', reason: 'All imposters eliminated' });
      } else if (aliveImposters >= aliveCrewmates) {
        room.gameState.phase = PHASE.GAME_OVER;
        io.to(data.roomCode).emit('gameOver', { winners: 'imposters', reason: 'Imposters outnumber crewmates' });
      }
    }
  }
});

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Cosmic Deception server running on http://localhost:${PORT}`);
});
