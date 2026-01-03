/**
 * Cosmic Deception - Main Game Logic
 * Among Us-style mobile game with voice chat
 */

class Game {
  constructor() {
    // Socket connection
    this.socket = io();
    this.playerId = null;
    this.roomCode = null;
    
    // Game state
    this.state = {
      phase: 'lobby',
      players: [],
      localPlayer: null,
      map: 'skeld',
      tasks: [],
      imposters: [],
      voted: false,
      voteTarget: null
    };
    
    // Game timers
    this.meetingTimer = null;
    this.meetingEndTime = null;
    this.emergencyCooldown = 0;
    
    // Canvas and rendering
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.camera = { x: 0, y: 0 };
    this.scale = 1;
    
    // Controls
    this.joystick = null;
    this.moveDirection = { x: 0, y: 0 };
    this.moveSpeed = 4;
    
    // Voice chat
    this.voiceChat = null;
    this.isVoiceMuted = false;
    
    // UI elements
    this.screens = {
      splash: document.getElementById('splash-screen'),
      menu: document.getElementById('menu-screen'),
      lobby: document.getElementById('lobby-screen'),
      game: document.getElementById('game-screen'),
      meeting: document.getElementById('meeting-screen'),
      gameover: document.getElementById('game-over-screen')
    };
    
    // Player colors - Inspired by Among Us crewmate colors
    // Using standardized color palette for player identification
    this.colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
      '#FFA500', '#800080', '#008000', '#000080', '#FFC0CB', '#A52A2A',
      '#808080', '#000000', '#4B0082', '#40E0D0', '#FA8072', '#EE82EE',
      '#FFD700', '#ADFF2F'
    ];
    
    // Map configuration
    // Map dimensions defined as constants for consistency
    const MAP_WIDTH = 1600;
    const MAP_HEIGHT = 1200;

    this.maps = {
      skeld: {
        name: 'The Skeld',
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        backgroundColor: '#1a1a2e',
        walls: this.generateSkeldWalls(),
        spawnPoints: [
          { x: 800, y: 600 },
          { x: 400, y: 300 },
          { x: 1200, y: 300 },
          { x: 400, y: 900 },
          { x: 1200, y: 900 }
        ],
        tasks: [],
        vents: [
          { x: 400, y: 400 },
          { x: 1200, y: 400 },
          { x: 400, y: 800 },
          { x: 1200, y: 800 }
        ]
      }
    };
    
    // Task definitions
    this.taskTemplates = [
      { id: 'fix_wires', name: 'Fix Wires', type: 'short', duration: 3000 },
      { id: 'fuel_engine', name: 'Fuel Engine', type: 'long', duration: 6000 },
      { id: 'clean_filter', name: 'Clean Filter', type: 'medium', duration: 4500 },
      { id: 'align_output', name: 'Align Output', type: 'short', duration: 3000 },
      { id: 'divert_power', name: 'Divert Power', type: 'medium', duration: 4500 },
      { id: 'unlock_manifolds', name: 'Unlock Manifolds', type: 'short', duration: 2500 },
      { id: 'start_reactor', name: 'Start Reactor', type: 'medium', duration: 5000 },
      { id: 'calibrate_distributor', name: 'Calibrate Distributor', type: 'long', duration: 7000 }
    ];
    
    // Initialize
    this.init();
  }
  
  init() {
    console.log('[Game] Initializing game...');
    
    // Setup canvas first (critical for rendering)
    this.setupCanvas();
    
    // Verify canvas was set up correctly
    if (!this.canvas || !this.ctx) {
      console.error('[Game] FATAL: Canvas initialization failed');
      this.showToast('Graphics initialization failed', 'error');
      return;
    }
    
    this.setupEventListeners();
    this.setupSocketListeners();
    this.setupJoystick();
    
    console.log('[Game] Game initialized, starting game loop');
    
    // Start game loop
    this.gameLoop();
  }
  
  generateSkeldWalls() {
    // Simplified wall data for The Skeld
    return [
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
      { x: 400, y: 500, width: 200, height: 20 },
    ];
  }
  
  setupCanvas() {
    const container = document.getElementById('canvas-container');
    
    // Check if canvas container exists
    if (!container) {
      console.error('[Game] Canvas container not found!');
      return;
    }
    
    const canvas = document.getElementById('game-canvas');
    
    // Check if canvas element exists
    if (!canvas) {
      console.error('[Game] Game canvas not found!');
      return;
    }
    
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // Verify context was created successfully
    if (!this.ctx) {
      console.error('[Game] Could not get 2D context from canvas!');
      return;
    }
    
    const resizeCanvas = () => {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
      this.scale = Math.min(
        this.canvas.width / this.maps.skeld.width,
        this.canvas.height / this.maps.skeld.height
      );
      console.log(`[Game] Canvas resized to ${this.canvas.width}x${this.canvas.height}, scale: ${this.scale.toFixed(2)}`);
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    console.log('[Game] Canvas setup complete');
  }
  
  setupEventListeners() {
    // Splash screen
    document.getElementById('play-btn').addEventListener('click', () => {
      this.showScreen('menu');
    });
    
    // Menu screen
    document.getElementById('create-room-btn').addEventListener('click', () => {
      this.createRoom();
    });
    
    document.getElementById('join-room-btn').addEventListener('click', () => {
      const code = document.getElementById('room-code-input').value.toUpperCase();
      if (code.length === 6) {
        this.joinRoom(code);
      } else {
        this.showToast('Please enter a valid room code', 'error');
      }
    });
    
    // Lobby screen
    document.getElementById('player-name-input').addEventListener('input', (e) => {
      this.updatePlayerName(e.target.value);
    });
    
    document.getElementById('start-game-btn').addEventListener('click', () => {
      this.startGame();
    });
    
    document.getElementById('leave-lobby-btn').addEventListener('click', () => {
      this.leaveRoom();
    });
    
    document.getElementById('copy-code-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(this.roomCode);
      this.showToast('Room code copied!', 'success');
    });
    
    // Game screen
    document.getElementById('action-btn').addEventListener('click', () => {
      this.handleAction();
    });
    
    document.getElementById('emergency-btn').addEventListener('click', () => {
      this.callEmergency();
    });
    
    document.getElementById('voice-btn').addEventListener('click', () => {
      this.toggleVoiceModal();
    });
    
    document.getElementById('mute-btn').addEventListener('click', () => {
      if (!this.voiceChat) {
        this.showToast('Voice chat not initialized', 'warning');
        return;
      }
      this.toggleMute();
    });
    
    // Meeting screen
    document.getElementById('skip-vote-btn').addEventListener('click', () => {
      this.skipVote();
    });
    
    document.getElementById('confirm-vote-btn').addEventListener('click', () => {
      this.confirmVote();
    });
    
    // Game over screen
    document.getElementById('return-lobby-btn').addEventListener('click', () => {
      this.returnToLobby();
    });
    
    // Settings modal
    document.getElementById('settings-btn').addEventListener('click', () => {
      this.showModal('settings-modal');
    });
    
    document.getElementById('close-settings').addEventListener('click', () => {
      this.hideModal('settings-modal');
    });
    
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });
    
    // Voice modal
    document.getElementById('close-voice-modal').addEventListener('click', () => {
      this.hideModal('voice-modal');
    });
    
    document.getElementById('toggle-mic-btn').addEventListener('click', () => {
      this.toggleMute();
    });
    
    // Task modal
    document.getElementById('close-task-modal').addEventListener('click', () => {
      this.hideModal('task-modal');
    });
  }
  
  setupSocketListeners() {
    // Join room
    this.socket.on('roomJoined', (response) => {
      if (response.success) {
        this.playerId = response.playerId;
        this.roomCode = response.roomCode;
        this.state.players = response.players;
        this.state.map = response.map;
        
        document.getElementById('lobby-room-code').textContent = response.roomCode;
        document.getElementById('max-players').textContent = response.settings.maxPlayers;
        
        this.updatePlayerList();
        this.generateColorSelector();
        
        if (this.socket.id === response.host) {
          document.getElementById('start-game-btn').disabled = false;
        }
        
        this.showScreen('lobby');
      }
    });
    
    // Player joined
    this.socket.on('playerJoined', (player) => {
      this.state.players.push(player);
      this.updatePlayerList();
      this.showToast(`${player.name} joined the game`, 'success');
    });
    
    // Player left
    this.socket.on('playerLeft', (data) => {
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        this.showToast(`${player.name} left the game`, 'warning');
      }
      this.state.players = this.state.players.filter(p => p.id !== data.playerId);
      this.updatePlayerList();
    });
    
    // Player updated
    this.socket.on('playerUpdated', (data) => {
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        Object.assign(player, data.updates);
        this.updatePlayerList();
      }
    });
    
    // Host changed
    this.socket.on('hostChanged', (data) => {
      const player = this.state.players.find(p => p.id === data.newHostId);
      if (player) {
        this.showToast(`${player.name} is now the host`, 'success');
      }
      document.getElementById('start-game-btn').disabled = (this.socket.id !== data.newHostId);
    });
    
    // Game started
    this.socket.on('gameStarted', (data) => {
      this.state.players = data.players;
      this.state.tasks = data.tasks;
      this.state.imposters = data.imposters;
      this.state.phase = 'tasks';
      this.state.voted = false;
      this.state.voteTarget = null;
      
      // Initialize voice chat
      this.initVoiceChat();
      
      // Update local player reference
      this.state.localPlayer = this.state.players.find(p => p.id === this.playerId);
      
      // Show game screen
      this.showScreen('game');
      
      // Update task progress
      this.updateTaskProgress(0, data.totalTasks);
      
      // Show role notification
      if (this.state.localPlayer.role === 'imposter') {
        this.showToast('You are the IMPOSTER!', 'error');
      } else {
        this.showToast('Complete all tasks to win!', 'success');
      }
    });
    
    // Player moved
    this.socket.on('playerMoved', (data) => {
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
      }
    });
    
    // Task completed
    this.socket.on('taskCompleted', (data) => {
      this.updateTaskProgress(data.progress, data.totalTasks);
      
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        this.showToast(`${player.name} completed a task!`, 'success');
      }
    });
    
    // Player killed
    this.socket.on('playerKilled', (data) => {
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        player.isAlive = false;
        this.showToast(`${player.name} was killed!`, 'error');
        
        // Remove player from voice chat
        if (this.voiceChat) {
          this.voiceChat.disconnectFromPeer(data.playerId);
        }
      }
    });
    
    // Meeting called
    this.socket.on('meetingCalled', (data) => {
      this.state.phase = 'meeting';
      this.showMeetingScreen(data);
    });
    
    // Meeting ended
    this.socket.on('meetingEnded', (results) => {
      this.state.phase = 'tasks';
      this.showScreen('game');
      
      if (results.ejected) {
        this.showToast(`${results.ejected.name} was ejected!`, 'warning');
      }
      
      // Reset voting state
      this.state.voted = false;
      this.state.voteTarget = null;
    });
    
    // Game over
    this.socket.on('gameOver', (data) => {
      this.state.phase = 'game_over';
      this.showGameOverScreen(data);
    });
  }
  
  setupJoystick() {
    // Check if joystick elements exist before initializing
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const stick = document.getElementById('joystick-stick');
    
    if (!zone || !base || !stick) {
      console.warn('[Game] Joystick elements not found, skipping joystick initialization');
      return;
    }
    
    // Check if VirtualJoystick class is available
    if (typeof VirtualJoystick === 'undefined') {
      console.warn('[Game] VirtualJoystick class not found, joystick disabled');
      return;
    }
    
    this.joystick = new VirtualJoystick({
      zoneId: 'joystick-zone',
      baseId: 'joystick-base',
      stickId: 'joystick-stick',
      maxRadius: 50,
      sensitivity: 1,
      onMove: (data) => {
        this.moveDirection.x = data.x;
        this.moveDirection.y = data.y;
      },
      onEnd: () => {
        this.moveDirection.x = 0;
        this.moveDirection.y = 0;
      }
    });
    console.log('[Game] Joystick initialized successfully');
  }
  
  async initVoiceChat() {
    if (!VoiceChat.isSupported()) {
      this.showToast('Voice chat not supported on this device', 'warning');
      return;
    }
    
    this.voiceChat = new VoiceChat({
      socket: this.socket,
      playerId: this.playerId,
      onPeerJoin: (playerId) => {
        const player = this.state.players.find(p => p.id === playerId);
        if (player) {
          console.log(`Connected to voice with ${player.name}`);
        }
      },
      onPeerLeave: (playerId) => {
        const player = this.state.players.find(p => p.id === playerId);
        if (player) {
          console.log(`Disconnected from voice with ${player.name}`);
        }
      },
      onSpeaking: (playerId, isSpeaking) => {
        // Update UI to show who's speaking
      }
    });
    
    await this.voiceChat.init();
  }
  
  createRoom() {
    const maxPlayers = parseInt(document.getElementById('max-players-slider').value);
    const settings = {
      maxPlayers,
      map: document.getElementById('map-select').value
    };
    
    this.socket.emit('createRoom', settings, (response) => {
      if (response && response.success) {
        // Automatically join the created room
        this.joinRoom(response.roomCode);
      } else {
        this.showToast('Failed to create room', 'error');
      }
    });
  }
  
  joinRoom(roomCode) {
    const playerName = document.getElementById('player-name-input').value || 'Player';
    const selectedColor = document.querySelector('.color-option.selected');
    const color = selectedColor ? selectedColor.dataset.color : this.colors[0];
    
    this.socket.emit('joinRoom', {
      roomCode,
      playerName,
      color
    }, (response) => {
      if (!response.success) {
        this.showToast(response.message, 'error');
      }
    });
  }
  
  updatePlayerName(name) {
    this.socket.emit('updatePlayer', { name });
  }
  
  updatePlayerColor(color) {
    this.socket.emit('updatePlayer', { color });
  }
  
  generateColorSelector() {
    const selector = document.getElementById('color-selector');
    selector.innerHTML = '';
    
    this.colors.forEach((color, index) => {
      const option = document.createElement('div');
      option.className = 'color-option';
      option.style.backgroundColor = color;
      option.dataset.color = color;
      option.dataset.index = index;
      
      if (index === 0) {
        option.classList.add('selected');
      }
      
      option.addEventListener('click', () => {
        document.querySelectorAll('.color-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        this.updatePlayerColor(color);
      });
      
      selector.appendChild(option);
    });
  }
  
  updatePlayerList() {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    
    document.getElementById('player-count').textContent = this.state.players.length;
    
    this.state.players.forEach((player, index) => {
      const card = document.createElement('div');
      card.className = 'player-card';
      if (this.socket.id === player.socketId) {
        card.classList.add('host');
      }
      
      // Escape HTML to prevent XSS - escape all dynamic content
      const escapedName = player.name
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      // Validate and sanitize color to prevent CSS injection attacks
      const validColorRegex = /^#[0-9A-Fa-f]{6}$/;
      const safeColor = validColorRegex.test(player.color) ? player.color : '#808080';

      const playerStatus = this.socket.id === player.socketId ? 'You' : '';

      // Use textContent for playerBadge to prevent XSS
      const playerBadge = this.socket.id === player.socketId ? '👤' : '';

      card.innerHTML = `
        <div class="player-color" style="background-color: ${safeColor}"></div>
        <div class="player-info">
          <div class="player-name">${escapedName}</div>
          <div class="player-status">${playerStatus}</div>
        </div>
      `;

      // Add badge separately to avoid innerHTML injection
      if (playerBadge) {
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'player-badge';
        badgeSpan.textContent = playerBadge;
        card.appendChild(badgeSpan);
      }
      
      list.appendChild(card);
    });
  }
  
  startGame() {
    this.socket.emit('startGame', (response) => {
      if (!response.success) {
        this.showToast(response.message, 'error');
      }
    });
  }
  
  leaveRoom() {
    this.socket.emit('leaveRoom');
    this.showScreen('menu');
    this.roomCode = null;
    this.playerId = null;
    
    // Disconnect voice chat
    if (this.voiceChat) {
      this.voiceChat.disconnect();
      this.voiceChat = null;
    }
  }
  
  handleAction() {
    if (this.state.phase !== 'tasks') return;
    
    const player = this.state.localPlayer;
    if (!player || !player.isAlive) return;
    
    // If imposter, try to kill nearby crewmate
    if (player.role === 'imposter') {
      const target = this.findClosestKillTarget(player);
      if (target) {
        this.socket.emit('killPlayer', target.id, (response) => {
          if (response.success) {
            this.showToast('Player eliminated!', 'success');
          } else {
            this.showToast(response.message, 'error');
          }
        });
        return;
      }
    }
    
    // Find closest interactable object
    let closestTask = null;
    let closestTaskDist = Infinity;
    let closestBody = null;
    let closestBodyDist = Infinity;
    
    // Check for nearby tasks
    for (const task of this.state.tasks) {
      if (task.assignedTo === this.playerId && !task.completed) {
        const dx = player.x - task.x;
        const dy = player.y - task.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 60 && distance < closestTaskDist) {
          closestTask = task;
          closestTaskDist = distance;
        }
      }
    }
    
    // Check for dead bodies
    for (const otherPlayer of this.state.players) {
      if (otherPlayer.id !== this.playerId && !otherPlayer.isAlive) {
        const dx = player.x - otherPlayer.x;
        const dy = player.y - otherPlayer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 60 && distance < closestBodyDist) {
          closestBody = otherPlayer;
          closestBodyDist = distance;
        }
      }
    }
    
    // Prioritize bodies over tasks
    if (closestBody && closestBodyDist < closestTaskDist) {
      this.reportBody();
    } else if (closestTask) {
      this.showTaskModal(closestTask);
    }
  }
  
  findClosestKillTarget(player) {
    let closestTarget = null;
    let closestDist = Infinity;
    
    for (const otherPlayer of this.state.players) {
      if (otherPlayer.id === player.id) continue;
      if (!otherPlayer.isAlive) continue;
      if (otherPlayer.role === 'imposter') continue;
      
      const dx = player.x - otherPlayer.x;
      const dy = player.y - otherPlayer.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 150 && distance < closestDist) {
        closestTarget = otherPlayer;
        closestDist = distance;
      }
    }
    return closestTarget;
  }
  
  reportBody() {
    this.socket.emit('reportBody', (response) => {
      if (!response.success) {
        this.showToast(response.message, 'error');
      }
    });
  }
  
  callEmergency() {
    if (this.state.phase !== 'tasks') return;
    
    const player = this.state.localPlayer;
    if (!player || !player.isAlive) return;
    
    this.socket.emit('emergencyMeeting', (response) => {
      if (!response.success) {
        this.showToast(response.message, 'error');
      }
    });
  }
  
  showTaskModal(task) {
    const modal = document.getElementById('task-modal');
    document.getElementById('task-title').textContent = task.name;
    
    const container = document.getElementById('task-container');
    
    // Create different task types
    if (task.id.includes('wire')) {
      this.createWireTask(container, task);
    } else {
      container.innerHTML = `
        <div class="task-progress-container">
          <div class="task-progress-bar">
            <div class="task-progress-fill" id="task-modal-progress" style="width: 0%"></div>
          </div>
          <p>Click repeatedly to complete...</p>
        </div>
      `;
      
      // Simple click task
      let clicks = 0;
      const totalClicks = 5;
      
      const clickHandler = () => {
        clicks++;
        const progress = (clicks / totalClicks) * 100;
        const progressBar = document.getElementById('task-modal-progress');
        if (progressBar) {
          progressBar.style.width = `${progress}%`;
        }
        
        if (clicks >= totalClicks) {
          container.removeEventListener('click', clickHandler);
          this.completeTask(task.id);
          this.hideModal('task-modal');
        }
      };
      
      container.addEventListener('click', clickHandler, { once: true });
    }
    
    this.showModal('task-modal');
  }
  
  createWireTask(container, task) {
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'];
    const leftWires = [...colors].sort(() => Math.random() - 0.5);
    const rightWires = [...colors].sort(() => Math.random() - 0.5);
    
    container.innerHTML = `
      <div class="task-wire-container">
        <div class="wire-pair">
          <div class="wire-col">
            ${leftWires.map((color, i) => `
              <div class="wire" data-color="${color}" data-side="left" data-index="${i}" 
                   style="background-color: ${color}"></div>
            `).join('')}
          </div>
          <div class="wire-col">
            ${rightWires.map((color, i) => `
              <div class="wire" data-color="${color}" data-side="right" data-index="${i}"
                   style="background-color: ${color}"></div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    let selectedWire = null;
    let connected = 0;
    
    container.querySelectorAll('.wire').forEach(wire => {
      wire.addEventListener('click', (e) => {
        const clickedWire = e.target;
        
        if (!selectedWire) {
          selectedWire = clickedWire;
          clickedWire.classList.add('selected');
        } else {
          const color1 = selectedWire.dataset.color;
          const color2 = clickedWire.dataset.color;
          
          if (color1 === color2 && selectedWire.dataset.side !== clickedWire.dataset.side) {
            // Correct connection
            connected++;
            selectedWire.style.opacity = '0.3';
            clickedWire.style.opacity = '0.3';
            selectedWire.classList.remove('selected');
            selectedWire = null;
            
            if (connected >= colors.length) {
              this.completeTask(task.id);
              this.hideModal('task-modal');
            }
          } else {
            // Wrong connection
            this.showToast('Wrong connection!', 'error');
            selectedWire.classList.remove('selected');
            selectedWire = null;
          }
        }
      });
    });
  }
  
  completeTask(taskId) {
    this.socket.emit('completeTask', taskId, (response) => {
      if (response.success) {
        this.showToast('Task completed!', 'success');
      }
    });
  }
  
  showMeetingScreen(data) {
    const grid = document.getElementById('voting-grid');
    grid.innerHTML = '';
    
    document.getElementById('meeting-title').textContent = 
      data.type === 'body' ? 'Body Reported' : 'Emergency Meeting';
    
    this.state.players.forEach(player => {
      const card = document.createElement('div');
      card.className = 'vote-card';
      if (!player.isAlive) card.classList.add('dead');
      
      // Escape HTML to prevent XSS - escape all dynamic content
      const escapedName = player.name
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      // Validate and sanitize color to prevent CSS injection attacks
      const validColorRegex = /^#[0-9A-Fa-f]{6}$/;
      const safeColor = validColorRegex.test(player.color) ? player.color : '#808080';

      card.innerHTML = `
        <div class="player-avatar" style="background-color: ${safeColor}"></div>
        <div class="player-name">${escapedName}</div>
        <div class="vote-indicator"></div>
      `;
      
      if (player.isAlive && player.id !== this.playerId) {
        card.addEventListener('click', () => {
          document.querySelectorAll('.vote-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          this.state.voteTarget = player.id;
          document.getElementById('confirm-vote-btn').disabled = false;
        });
      }
      
      grid.appendChild(card);
    });
    
    this.startMeetingTimer(data.discussionTime, data.votingTime);
    this.showScreen('meeting');
  }
  
  startMeetingTimer(discussionTime, votingTime) {
    const countdown = document.getElementById('meeting-countdown');
    const phase = document.getElementById('meeting-phase');
    
    let currentPhase = 'discussion';
    let discussionTimeLeft = discussionTime;
    let votingTimeLeft = votingTime;
    
    phase.textContent = 'Discussion';
    countdown.textContent = discussionTimeLeft;
    
    // Use timestamp-based timing for accuracy
    const startTime = Date.now();
    const discussionDuration = discussionTime * 1000;
    const votingDuration = votingTime * 1000;
    
    // Clear any existing timer
    if (this.meetingTimer) {
      clearInterval(this.meetingTimer);
    }
    
    this.meetingTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      if (currentPhase === 'discussion') {
        const remaining = Math.max(0, Math.ceil((discussionDuration - elapsed) / 1000));
        countdown.textContent = remaining;
        
        if (remaining <= 0) {
          currentPhase = 'voting';
          phase.textContent = 'Voting';
          countdown.textContent = votingTimeLeft;
          
          // Enable skip vote button
          document.getElementById('skip-vote-btn').disabled = false;
          
          // Auto-end meeting if everyone voted
          if (!this.state.voted) {
            this.showToast('Submit your vote!', 'warning');
          }
        }
      } else {
        const votingElapsed = elapsed - discussionDuration;
        const remaining = Math.max(0, Math.ceil((votingDuration - votingElapsed) / 1000));
        countdown.textContent = remaining;
        
        if (remaining <= 0) {
          clearInterval(this.meetingTimer);
          this.meetingTimer = null;
          this.endMeeting();
        }
      }
    }, 100);
  }

  skipVote() {
    if (this.state.voted) return;
    
    this.socket.emit('skipVote', (response) => {
      if (response.success) {
        this.state.voted = true;
        document.getElementById('confirm-vote-btn').textContent = 'Vote Submitted';
        document.getElementById('confirm-vote-btn').disabled = true;
        document.getElementById('skip-vote-btn').disabled = true;
      }
    });
  }
  
  confirmVote() {
    if (this.state.voted || !this.state.voteTarget) return;
    
    this.socket.emit('vote', this.state.voteTarget, (response) => {
      if (response.success) {
        this.state.voted = true;
        document.getElementById('confirm-vote-btn').textContent = 'Vote Submitted';
        document.getElementById('confirm-vote-btn').disabled = true;
        document.getElementById('skip-vote-btn').disabled = true;
      }
    });
  }
  
  endMeeting() {
    // Clear meeting timer to prevent memory leaks
    if (this.meetingTimer) {
      clearInterval(this.meetingTimer);
      this.meetingTimer = null;
    }
    this.socket.emit('endMeeting', {});
  }
  
  showGameOverScreen(data) {
    const container = document.getElementById('gameover-winners');
    const title = document.getElementById('gameover-title');
    const reason = document.getElementById('gameover-reason');
    
    reason.textContent = data.reason;
    
    if (data.winners === 'crewmates') {
      title.textContent = 'Crewmates Win!';
      title.style.color = '#10B981';
      container.innerHTML = '<span class="winner-icon">✅</span>';
    } else {
      title.textContent = 'Imposters Win!';
      title.style.color = '#EF4444';
      container.innerHTML = '<span class="winner-icon">🔪</span>';
    }
    
    this.showScreen('gameover');
    
    // Disconnect voice chat
    if (this.voiceChat) {
      this.voiceChat.disconnect();
      this.voiceChat = null;
    }
  }
  
  returnToLobby() {
    this.showScreen('lobby');
    this.state.phase = 'lobby';
    
    // Clear any active meeting timer
    if (this.meetingTimer) {
      clearInterval(this.meetingTimer);
      this.meetingTimer = null;
    }
    
    // Reset all timers and game state
    this.emergencyCooldown = 0;
    this.meetingEndTime = null;
    
    // Reset player states
    this.state.players.forEach(p => {
      p.isAlive = true;
      p.role = 'crewmate';
      p.votedFor = null;
    });
    
    // Reset voting state
    this.state.voted = false;
    this.state.voteTarget = null;
  }
  
  toggleVoiceModal() {
    this.showModal('voice-modal');
  }
  
  toggleMute() {
    if (!this.voiceChat) return;
    
    this.isMuted = this.voiceChat.toggleMute();
    
    const voiceBtn = document.getElementById('voice-btn');
    const muteBtn = document.getElementById('mute-btn');
    
    if (this.isMuted) {
      voiceBtn.classList.add('muted');
      muteBtn.classList.add('muted');
      this.showToast('Microphone muted', 'warning');
    } else {
      voiceBtn.classList.remove('muted');
      muteBtn.classList.remove('muted');
      this.showToast('Microphone unmuted', 'success');
    }
  }
  
  updateTaskProgress(completed, total) {
    const fill = document.getElementById('task-progress-fill');
    const text = document.getElementById('task-progress-text');
    
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    fill.style.width = `${percentage}%`;
    text.textContent = `${completed}/${total}`;
  }
  
  showScreen(screenName) {
    Object.values(this.screens).forEach(screen => {
      screen.classList.remove('active');
    });
    this.screens[screenName].classList.add('active');
  }
  
  showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }
  
  hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }
  
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
  
  saveSettings() {
    // Settings are saved in the modal state
    this.hideModal('settings-modal');
    this.showToast('Settings saved!', 'success');
  }
  
  // Game loop
  gameLoop() {
    // Verify rendering context exists before updating
    if (!this.ctx) {
      console.error('[Game] Cannot run game loop - rendering context not available');
      requestAnimationFrame(() => this.gameLoop());
      return;
    }
    
    this.update();
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }
  
  update() {
    if (this.state.phase !== 'tasks') return;
    
    const player = this.state.localPlayer;
    if (!player || !player.isAlive) return;
    
    // Apply movement
    if (this.moveDirection.x !== 0 || this.moveDirection.y !== 0) {
      const map = this.maps[this.state.map];
      
      let newX = player.x + this.moveDirection.x * this.moveSpeed;
      let newY = player.y + this.moveDirection.y * this.moveSpeed;
      
      // Boundary check
      newX = Math.max(20, Math.min(map.width - 20, newX));
      newY = Math.max(20, Math.min(map.height - 20, newY));
      
      // Simple wall collision
      const wall = this.checkWallCollision(newX, newY, 20);
      if (!wall) {
        player.x = newX;
        player.y = newY;
        
        // Send movement to server
        this.socket.emit('playerMove', { x: player.x, y: player.y });
      }
    }
    
    // Update action button state
    this.updateActionButtonState();
  }
  
  checkWallCollision(x, y, radius) {
    const map = this.maps[this.state.map];
    
    for (const wall of map.walls) {
      const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.height));
      
      const dx = x - closestX;
      const dy = y - closestY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < radius) {
        return wall;
      }
    }
    
    return null;
  }
  
  updateActionButtonState() {
    const player = this.state.localPlayer;
    const actionBtn = document.getElementById('action-btn');
    
    if (!player || !player.isAlive) {
      actionBtn.classList.remove('active');
      return;
    }
    
    let canInteract = false;
    
    // Check for nearby tasks
    for (const task of this.state.tasks) {
      if (task.assignedTo === this.playerId && !task.completed) {
        const dx = player.x - task.x;
        const dy = player.y - task.y;
        if (Math.sqrt(dx * dx + dy * dy) < 60) {
          canInteract = true;
          break;
        }
      }
    }
    
    // Check for dead bodies
    if (!canInteract) {
      for (const otherPlayer of this.state.players) {
        if (otherPlayer.id !== this.playerId && !otherPlayer.isAlive) {
          const dx = player.x - otherPlayer.x;
          const dy = player.y - otherPlayer.y;
          if (Math.sqrt(dx * dx + dy * dy) < 60) {
            canInteract = true;
            break;
          }
        }
      }
    }
    
    if (canInteract) {
      actionBtn.classList.add('active');
    } else {
      actionBtn.classList.remove('active');
    }
  }
  
  render() {
    if (this.state.phase !== 'tasks') return;
    
    // Verify canvas and context exist
    if (!this.canvas || !this.ctx) {
      console.warn('[Game] Render skipped - canvas not ready');
      return;
    }
    
    const ctx = this.ctx;
    const canvas = this.canvas;
    const map = this.maps[this.state.map];
    
    // Clear canvas
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate camera position
    const player = this.state.localPlayer;
    if (player) {
      this.camera.x = player.x - canvas.width / 2;
      this.camera.y = player.y - canvas.height / 2;
      
      // Clamp camera to map bounds
      this.camera.x = Math.max(0, Math.min(map.width - canvas.width, this.camera.x));
      this.camera.y = Math.max(0, Math.min(map.height - canvas.height, this.camera.y));
    }
    
    // Apply camera transform
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
    
    // Draw map background
    ctx.fillStyle = map.backgroundColor;
    ctx.fillRect(0, 0, map.width, map.height);
    
    // Draw room backgrounds
    this.drawRoomBackgrounds();
    
    // Draw floor pattern
    this.drawFloorPattern();
    
    // Draw enhanced walls
    this.drawEnhancedWalls();
    
    // Draw vents
    map.vents.forEach(vent => {
      this.drawEnhancedVent(vent);
    });
    
    // Draw tasks
    this.state.tasks.forEach(task => {
      if (!task.completed) {
        this.drawTaskWithDetails(task);
      }
    });
    
    // Draw players (sorted by Y for depth)
    const sortedPlayers = [...this.state.players].sort((a, b) => a.y - b.y);
    
    sortedPlayers.forEach(p => {
      this.drawPlayer(p);
    });
    
    // Draw vision cone for local player
    if (player && player.isAlive) {
      this.drawEnhancedVisionCone(player);
    }
    
    ctx.restore();
    
    // Draw minimap in corner
    this.drawMinimap();
  }
  
  drawMinimap() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const map = this.maps[this.state.map];
    const player = this.state.localPlayer;
    
    if (!player) return;
    
    const minimapSize = 150;
    const minimapX = canvas.width - minimapSize - 15;
    const minimapY = canvas.height - minimapSize - 15;
    const scale = minimapSize / Math.max(map.width, map.height);
    
    // Minimap background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(minimapX - 5, minimapY - 5, minimapSize + 10, minimapSize + 10, 8);
    ctx.fill();
    
    // Minimap border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw players on minimap
    this.state.players.forEach(p => {
      const minimapPlayerX = minimapX + p.x * scale;
      const minimapPlayerY = minimapY + p.y * scale;
      
      ctx.fillStyle = p.isAlive ? p.color : '#666666';
      ctx.beginPath();
      ctx.arc(minimapPlayerX, minimapPlayerY, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Draw view area
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      minimapX + this.camera.x * scale,
      minimapY + this.camera.y * scale,
      canvas.width * scale,
      canvas.height * scale
    );
  }
  
  drawFloorPattern() {
    const ctx = this.ctx;
    const map = this.maps[this.state.map];
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < map.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, map.height);
      ctx.stroke();
    }
    
    for (let y = 0; y < map.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(map.width, y);
      ctx.stroke();
    }
  }
  
  drawRoomBackgrounds() {
    const ctx = this.ctx;
    
    // Room configurations with colors and labels
    const rooms = [
      { x: 0, y: 0, width: 600, height: 400, name: 'Cafeteria', color: '#1e3a5f' },
      { x: 0, y: 800, width: 400, height: 400, name: 'Shields', color: '#2d4a3e' },
      { x: 0, y: 400, width: 400, height: 400, name: 'Admin', color: '#4a3728' },
      { x: 200, y: 0, width: 300, height: 100, name: 'Navigation', color: '#3d3d5c' },
      { x: 1000, y: 0, width: 600, height: 200, name: 'Reactor', color: '#5c1a1a' },
      { x: 700, y: 200, width: 200, height: 200, name: 'Electrical', color: '#4a4a2a' },
      { x: 400, y: 500, width: 200, height: 200, name: 'Medbay', color: '#1a4a3d' },
      { x: 1300, y: 700, width: 300, height: 400, name: 'Storage', color: '#3d3d3d' },
      { x: 700, y: 900, width: 300, height: 200, name: 'Lower Engine', color: '#4a2d1a' },
      { x: 1100, y: 200, width: 200, height: 300, name: 'Upper Engine', color: '#5c2d1a' },
    ];
    
    rooms.forEach(room => {
      // Draw room floor with gradient
      const gradient = ctx.createRadialGradient(
        room.x + room.width / 2, room.y + room.height / 2, 0,
        room.x + room.width / 2, room.y + room.height / 2, Math.max(room.width, room.height) / 2
      );
      gradient.addColorStop(0, room.color);
      gradient.addColorStop(1, this.maps[this.state.map].backgroundColor);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(room.x, room.y, room.width, room.height);
      
      // Draw room border with glow
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.strokeRect(room.x, room.y, room.width, room.height);
      ctx.setLineDash([]);
      
      // Draw room name
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.font = 'bold 16px Rubik';
      ctx.textAlign = 'center';
      ctx.fillText(room.name, room.x + room.width / 2, room.y + room.height / 2);
    });
  }
  
  drawEnhancedWalls() {
    const ctx = this.ctx;
    const map = this.maps[this.state.map];
    
    map.walls.forEach(wall => {
      // 3D wall effect - main wall
      const gradient = ctx.createLinearGradient(wall.x, wall.y, wall.x, wall.y + wall.height);
      gradient.addColorStop(0, '#475569');
      gradient.addColorStop(0.5, '#334155');
      gradient.addColorStop(1, '#1e293b');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      
      // Top highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(wall.x, wall.y, wall.width, 3);
      
      // Left highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(wall.x, wall.y, 3, wall.height);
      
      // Right shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(wall.x + wall.width - 3, wall.y, 3, wall.height);
      
      // Bottom shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(wall.x, wall.y + wall.height - 3, wall.width, 3);
      
      // Edge outline
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    });
  }
  
  drawTaskWithDetails(task) {
    const ctx = this.ctx;
    const player = this.state.localPlayer;
    const isNearby = player && 
      Math.sqrt(Math.pow(player.x - task.x, 2) + Math.pow(player.y - task.y, 2)) < 80;
    const isAssigned = task.assignedTo === this.playerId;
    
    // Draw task platform
    const gradient = ctx.createRadialGradient(task.x, task.y, 0, task.x, task.y, 25);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(task.x, task.y, 25, 0, Math.PI * 2);
    ctx.fill();
    
    // Task base
    ctx.fillStyle = isNearby ? '#10B981' : '#374151';
    ctx.beginPath();
    ctx.arc(task.x, task.y, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // Task inner circle
    ctx.fillStyle = isNearby ? '#059669' : '#4B5563';
    ctx.beginPath();
    ctx.arc(task.x, task.y, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Task icon based on type
    ctx.fillStyle = '#fff';
    ctx.font = '14px Rubik';
    ctx.textAlign = 'center';
    
    let icon = '📋';
    if (task.id.includes('wire')) icon = '⚡';
    else if (task.id.includes('fuel')) icon = '⛽';
    else if (task.id.includes('filter')) icon = '🧹';
    else if (task.id.includes('reactor')) icon = '⚛️';
    else if (task.id.includes('power')) icon = '🔌';
    else if (task.id.includes('distributor')) icon = '📊';
    
    ctx.fillText(icon, task.x, task.y + 5);
    
    // Draw assignment indicator for local player
    if (isAssigned && isNearby) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(task.x, task.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  
  drawEnhancedVent(vent) {
    const ctx = this.ctx;
    
    // Vent shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(vent.x + 3, vent.y + 3, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Vent outer ring
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(vent.x, vent.y, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Vent inner
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(vent.x, vent.y, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Vent slats
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(vent.x - 12, vent.y + i * 3);
      ctx.lineTo(vent.x + 12, vent.y + i * 3);
      ctx.stroke();
    }
    
    // Vent border
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(vent.x, vent.y, 22, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  drawPlayer(player) {
    const ctx = this.ctx;
    const isLocalPlayer = player.id === this.playerId;
    
    // Draw shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 22, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    
    if (!player.isAlive) {
      // Draw dead body
      this.drawDeadBody(player);
      return;
    }
    
    // Draw backpack
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.ellipse(player.x - 15, player.y + 5, 8, 12, -0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Backpack highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.ellipse(player.x - 17, player.y + 2, 3, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw body (spacesuit)
    const bodyGradient = ctx.createRadialGradient(
      player.x - 5, player.y - 5, 0,
      player.x, player.y, 22
    );
    bodyGradient.addColorStop(0, player.color);
    bodyGradient.addColorStop(1, this.darkenColor(player.color, 30));
    
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Body outline
    ctx.strokeStyle = this.darkenColor(player.color, 20);
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw visor
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.ellipse(player.x + 5, player.y - 5, 14, 9, -0.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Visor inner glow
    const visorGradient = ctx.createLinearGradient(player.x, player.y - 14, player.x + 10, player.y + 4);
    visorGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    visorGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = visorGradient;
    ctx.beginPath();
    ctx.ellipse(player.x + 5, player.y - 5, 14, 9, -0.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Visor reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(player.x + 8, player.y - 8, 5, 3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw legs/feet indicators
    ctx.fillStyle = this.darkenColor(player.color, 20);
    ctx.beginPath();
    ctx.ellipse(player.x - 8, player.y + 18, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(player.x + 8, player.y + 18, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw name tag background
    const nameWidth = ctx.measureText(player.name).width + 20;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(player.x - nameWidth / 2, player.y - 48, nameWidth, 18, 4);
    ctx.fill();
    
    // Draw name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Rubik';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y - 35);
    
    // Draw role indicator for local imposter
    if (player.role === 'imposter' && isLocalPlayer) {
      ctx.fillStyle = '#EF4444';
      ctx.font = '12px Rubik';
      ctx.fillText('🔪', player.x, player.y - 55);
    }
    
    // Draw task progress dots
    if (player.role === 'crewmate' && player.completedTasks > 0) {
      const dotSpacing = 8;
      const totalWidth = player.completedTasks * dotSpacing;
      const startX = player.x - totalWidth / 2 + dotSpacing / 2;
      
      for (let i = 0; i < player.completedTasks; i++) {
        ctx.fillStyle = '#10B981';
        ctx.beginPath();
        ctx.arc(startX + i * dotSpacing, player.y + 32, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Draw speaking indicator for voice chat
    if (this.voiceChat && this.voiceChat.isSpeaking() && player.id !== this.playerId) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 28, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw local player indicator
    if (isLocalPlayer) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 25, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  
  drawDeadBody(player) {
    const ctx = this.ctx;
    
    // Body lying down
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(Math.PI / 4);
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(5, 5, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Body
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Visor
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.ellipse(12, -3, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    
    // Ghost icon above body
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.font = '16px Rubik';
    ctx.textAlign = 'center';
    ctx.fillText('👻', player.x, player.y - 35);
    
    // X mark on body
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(player.x - 15, player.y - 8);
    ctx.lineTo(player.x + 15, player.y + 15);
    ctx.moveTo(player.x + 15, player.y - 8);
    ctx.lineTo(player.x - 15, player.y + 15);
    ctx.stroke();
    
    // Name tag (faded)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(player.x - 35, player.y - 55, 70, 16, 4);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 10px Rubik';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y - 43);
  }
  
  drawEnhancedVisionCone(player) {
    const ctx = this.ctx;
    
    // Create gradient for vision
    const gradient = ctx.createRadialGradient(
      player.x, player.y, 50,
      player.x, player.y, 350
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.05)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 350, 0, Math.PI * 2);
    ctx.fill();
    
    // Outer ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 350, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  darkenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Game] DOM loaded, creating game instance');
  try {
    window.game = new Game();
    console.log('[Game] Game instance created successfully');
  } catch (error) {
    console.error('[Game] FATAL: Failed to create game instance:', error);
  }
});
