/**
 * Cosmic Deception - Main Game Logic
 */

class Game {
  constructor() {
    this.socket = io();
    this.playerId = null;
    this.roomCode = null;
    
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
    
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.camera = { x: 0, y: 0 };
    this.scale = 1;
    
    this.joystick = null;
    this.moveDirection = { x: 0, y: 0 };
    this.moveSpeed = 4;
    
    this.voiceChat = null;
    this.isVoiceMuted = false;
    
    this.screens = {
      splash: document.getElementById('splash-screen'),
      menu: document.getElementById('menu-screen'),
      lobby: document.getElementById('lobby-screen'),
      game: document.getElementById('game-screen'),
      meeting: document.getElementById('meeting-screen'),
      gameover: document.getElementById('gameover-screen')
    };
    
    this.colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
      '#FFA500', '#800080', '#008000', '#000080', '#FFC0CB', '#A52A2A',
      '#808080', '#000000', '#4B0082', '#40E0D0', '#FA8072', '#EE82EE',
      '#FFD700', '#ADFF2F'
    ];
    
    this.maps = {
      skeld: {
        name: 'The Skeld',
        width: 1600,
        height: 1200,
        backgroundColor: '#1a1a2e',
        walls: [],
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
    
    this.init();
  }
  
  init() {
    this.setupCanvas();
    this.setupEventListeners();
    this.setupSocketListeners();
    this.setupJoystick();
    this.gameLoop();
  }
  
  setupCanvas() {
    const resizeCanvas = () => {
      const container = document.getElementById('canvas-container');
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
      this.scale = Math.min(
        this.canvas.width / this.maps.skeld.width,
        this.canvas.height / this.maps.skeld.height
      );
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }
  
  setupEventListeners() {
    document.getElementById('play-btn').addEventListener('click', () => {
      this.showScreen('menu');
    });
    
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
      this.toggleMute();
    });
    
    document.getElementById('skip-vote-btn').addEventListener('click', () => {
      this.skipVote();
    });
    
    document.getElementById('confirm-vote-btn').addEventListener('click', () => {
      this.confirmVote();
    });
    
    document.getElementById('return-lobby-btn').addEventListener('click', () => {
      this.returnToLobby();
    });
    
    document.getElementById('settings-btn').addEventListener('click', () => {
      this.showModal('settings-modal');
    });
    
    document.getElementById('close-settings').addEventListener('click', () => {
      this.hideModal('settings-modal');
    });
    
    document.getElementById('close-voice-modal').addEventListener('click', () => {
      this.hideModal('voice-modal');
    });
    
    document.getElementById('toggle-mic-btn').addEventListener('click', () => {
      this.toggleMute();
    });
    
    document.getElementById('close-task-modal').addEventListener('click', () => {
      this.hideModal('task-modal');
    });
  }
  
  setupSocketListeners() {
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
    
    this.socket.on('playerJoined', (player) => {
      this.state.players.push(player);
      this.updatePlayerList();
      this.showToast(`${player.name} joined the game`, 'success');
    });
    
    this.socket.on('playerLeft', (data) => {
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        this.showToast(`${player.name} left the game`, 'warning');
      }
      this.state.players = this.state.players.filter(p => p.id !== data.playerId);
      this.updatePlayerList();
    });
    
    this.socket.on('playerUpdated', (data) => {
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        Object.assign(player, data.updates);
        this.updatePlayerList();
      }
    });
    
    this.socket.on('hostChanged', (data) => {
      const player = this.state.players.find(p => p.id === data.newHostId);
      if (player) {
        document.getElementById('start-game-btn').disabled = (this.socket.id !== player.socketId);
      }
    });
    
    this.socket.on('gameStarted', (data) => {
      this.state.players = data.players;
      this.state.tasks = data.tasks;
      this.state.imposters = data.imposters;
      this.state.phase = 'tasks';
      this.state.voted = false;
      this.state.voteTarget = null;
      
      this.initVoiceChat();
      
      this.state.localPlayer = this.state.players.find(p => p.id === this.playerId);
      
      this.showScreen('game');
      this.updateTaskProgress(0, data.totalTasks);
      
      if (this.state.localPlayer.role === 'imposter') {
        this.showToast('You are the IMPOSTER!', 'error');
      } else {
        this.showToast('Complete all tasks to win!', 'success');
      }
    });
    
    this.socket.on('playerMoved', (data) => {
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
      }
    });
    
    this.socket.on('taskCompleted', (data) => {
      this.updateTaskProgress(data.progress, data.totalTasks);
      
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        this.showToast(`${player.name} completed a task!`, 'success');
      }
    });
    
    this.socket.on('playerKilled', (data) => {
      const player = this.state.players.find(p => p.id === data.playerId);
      if (player) {
        player.isAlive = false;
        this.showToast(`${player.name} was killed!`, 'error');
        
        if (this.voiceChat) {
          this.voiceChat.disconnectFromPeer(data.playerId);
        }
      }
    });
    
    this.socket.on('meetingCalled', (data) => {
      this.state.phase = 'meeting';
      this.showMeetingScreen(data);
    });
    
    this.socket.on('meetingEnded', (results) => {
      this.state.phase = 'tasks';
      this.showScreen('game');
      
      if (results.ejected) {
        this.showToast(`${results.ejected.name} was ejected!`, 'warning');
      }
      
      this.state.voted = false;
      this.state.voteTarget = null;
    });
    
    this.socket.on('gameOver', (data) => {
      this.state.phase = 'game_over';
      this.showGameOverScreen(data);
    });
  }
  
  setupJoystick() {
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
    
    this.state.players.forEach((player) => {
      const card = document.createElement('div');
      card.className = 'player-card';
      if (this.socket.id === player.socketId) {
        card.classList.add('host');
      }
      
      card.innerHTML = `
        <div class="player-color" style="background-color: ${player.color}"></div>
        <div class="player-info">
          <div class="player-name">${player.name}</div>
          <div class="player-status">${this.socket.id === player.socketId ? 'You' : ''}</div>
        </div>
      `;
      
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
    
    if (this.voiceChat) {
      this.voiceChat.disconnect();
      this.voiceChat = null;
    }
  }
  
  handleAction() {
    if (this.state.phase !== 'tasks') return;
    
    const player = this.state.localPlayer;
    if (!player || !player.isAlive) return;
    
    for (const task of this.state.tasks) {
      if (task.assignedTo === this.playerId && !task.completed) {
        const dx = player.x - task.x;
        const dy = player.y - task.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 60) {
          this.showTaskModal(task);
          return;
        }
      }
    }
    
    for (const otherPlayer of this.state.players) {
      if (otherPlayer.id !== this.playerId && !otherPlayer.isAlive) {
        const dx = player.x - otherPlayer.x;
        const dy = player.y - otherPlayer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 60) {
          this.reportBody();
          return;
        }
      }
    }
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
      
      let clicks = 0;
      const totalClicks = 5;
      
      const clickHandler = () => {
        clicks++;
        const progress = (clicks / totalClicks) * 100;
        document.getElementById('task-modal-progress').style.width = `${progress}%`;
        
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
      
      card.innerHTML = `
        <div class="player-avatar" style="background-color: ${player.color}"></div>
        <div class="player-name">${player.name}</div>
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
    
    let timeLeft = discussionTime;
    phase.textContent = 'Discussion';
    countdown.textContent = timeLeft;
    
    const timer = setInterval(() => {
      timeLeft--;
      countdown.textContent = timeLeft;
      
      if (timeLeft <= 0) {
        if (phase.textContent === 'Discussion') {
          phase.textContent = 'Voting';
          timeLeft = votingTime;
          document.getElementById('skip-vote-btn').disabled = false;
          
          if (!this.state.voted) {
            this.showToast('Submit your vote!', 'warning');
          }
        } else {
          clearInterval(timer);
          this.endMeeting();
        }
      }
    }, 1000);
    
    this.meetingTimer = timer;
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
    
    if (this.voiceChat) {
      this.voiceChat.disconnect();
      this.voiceChat = null;
    }
  }
  
  returnToLobby() {
    this.showScreen('lobby');
    this.state.phase = 'lobby';
    
    this.state.players.forEach(p => {
      p.isAlive = true;
      p.role = 'crewmate';
    });
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
  
  gameLoop() {
    this.update();
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }
  
  update() {
    if (this.state.phase !== 'tasks') return;
    
    const player = this.state.localPlayer;
    if (!player || !player.isAlive) return;
    
    if (this.moveDirection.x !== 0 || this.moveDirection.y !== 0) {
      const map = this.maps[this.state.map];
      
      let newX = player.x + this.moveDirection.x * this.moveSpeed;
      let newY = player.y + this.moveDirection.y * this.moveSpeed;
      
      newX = Math.max(20, Math.min(map.width - 20, newX));
      newY = Math.max(20, Math.min(map.height - 20, newY));
      
      player.x = newX;
      player.y = newY;
      
      this.socket.emit('playerMove', { x: player.x, y: player.y });
    }
    
    this.updateActionButtonState();
  }
  
  updateActionButtonState() {
    const player = this.state.localPlayer;
    const actionBtn = document.getElementById('action-btn');
    
    if (!player || !player.isAlive) {
      actionBtn.classList.remove('active');
      return;
    }
    
    let canInteract = false;
    
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
    
    const ctx = this.ctx;
    const canvas = this.canvas;
    const map = this.maps[this.state.map];
    
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const player = this.state.localPlayer;
    if (player) {
      this.camera.x = player.x - canvas.width / 2;
      this.camera.y = player.y - canvas.height / 2;
    }
    
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
    
    ctx.fillStyle = map.backgroundColor;
    ctx.fillRect(0, 0, map.width, map.height);
    
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
    
    map.walls.forEach(wall => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    });
    
    this.state.tasks.forEach(task => {
      if (!task.completed) {
        const isNearby = player && 
          Math.sqrt(Math.pow(player.x - task.x, 2) + Math.pow(player.y - task.y, 2)) < 80;
        
        ctx.fillStyle = isNearby ? '#10B981' : '#64748B';
        ctx.beginPath();
        ctx.arc(task.x, task.y, 15, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = '12px Rubik';
        ctx.textAlign = 'center';
        ctx.fillText('📋', task.x, task.y + 5);
      }
    });
    
    map.vents.forEach(vent => {
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.ellipse(vent.x, vent.y, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    
    const sortedPlayers = [...this.state.players].sort((a, b) => a.y - b.y);
    
    sortedPlayers.forEach(p => {
      this.drawPlayer(p);
    });
    
    if (player && player.isAlive) {
      const gradient = ctx.createRadialGradient(
        player.x, player.y, 0,
        player.x, player.y, 300
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 300, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  drawPlayer(player) {
    const ctx = this.ctx;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 18, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#87CEEB';
    ctx.beginPath();
    ctx.ellipse(player.x + 5, player.y - 5, 12, 8, -0.2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(player.x + 8, player.y - 7, 4, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();
    
    if (!player.isAlive) {
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(player.x - 15, player.y - 15);
      ctx.lineTo(player.x + 15, player.y + 15);
      ctx.moveTo(player.x + 15, player.y - 15);
      ctx.lineTo(player.x - 15, player.y + 15);
      ctx.stroke();
    }
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Rubik';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y - 30);
    
    if (player.role === 'imposter' && player.id === this.playerId) {
      ctx.fillStyle = '#EF4444';
      ctx.font = '10px Rubik';
      ctx.fillText('🔪', player.x, player.y - 45);
    }
    
    if (player.isAlive && player.role === 'crewmate' && player.completedTasks > 0) {
      const taskProgress = player.completedTasks;
      ctx.fillStyle = '#10B981';
      ctx.font = '10px Rubik';
      ctx.fillText(`${'✓'.repeat(Math.min(taskProgress, 5))}`, player.x, player.y + 35);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
