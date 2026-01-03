/**
 * Cosmic Deception - Game Client
 * Main game logic, rendering, and player interactions
 */

// ========================================
// Game Configuration Constants
// ========================================
// These constants define core game settings that may need adjustment
const CONFIG = {
    // Map dimensions (must match server)
    MAP_WIDTH: 2000,
    MAP_HEIGHT: 2000,
    
    // Visual settings
    BACKGROUND_COLOR: '#0a0a1a',
    GRID_COLOR: '#1a1a3a',
    GRID_SIZE: 100,
    
    // Player settings
    PLAYER_COLORS: [
        '#ff4444', // Red
        '#4444ff', // Blue
        '#44ff44', // Green
        '#ffff44', // Yellow
        '#ffaa00', // Orange
        '#aa44ff', // Purple
        '#44ffff', // Cyan
        '#ff44ff'  // Magenta
    ],
    
    // Ship settings
    SHIP_SIZES: {
        small: { radius: 15, speed: 5, handling: 0.1 },
        medium: { radius: 20, speed: 4, handling: 0.08 },
        large: { radius: 25, speed: 3, handling: 0.06 }
    },
    
    // Combat settings
    WEAPON_COOLDOWNS: {
        primary: 10,
        secondary: 60,
        special: 180
    },
    
    // UI settings
    CHAT_MAX_MESSAGES: 50,
    CHAT_MAX_LENGTH: 200,
    NOTIFICATION_DURATION: 3000
};

// ========================================
// Global Game State
// ========================================
const game = {
    // Connection state
    connected: false,
    socket: null,
    playerId: null,
    
    // Game state
    phase: 'menu', // menu, lobby, playing, ended
    players: new Map(),
    ships: new Map(),
    asteroids: [],
    projectiles: [],
    
    // Local player data
    localPlayer: null,
    localShip: null,
    
    // Input state
    inputs: {
        thrust: false,
        brake: false,
        rotateLeft: false,
        rotateRight: false,
        firePrimary: false,
        fireSecondary: false,
        activateAbility: -1
    },
    
    // Camera
    camera: {
        x: 0,
        y: 0,
        zoom: 1
    },
    
    // Canvas context
    canvas: null,
    ctx: null,
    
    // Timing
    lastUpdate: 0,
    deltaTime: 0,
    
    // Assets
    images: {},
    
    // Audio
    audioContext: null,
    sounds: {}
};

// ========================================
// Initialization
// ========================================
function initGame() {
    console.log('[Game] Initializing game client...');
    
    // Get canvas context
    game.canvas = document.getElementById('game-canvas');
    game.ctx = game.canvas.getContext('2d');
    
    // Set up canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Set up input handlers
    setupKeyboardInput();
    setupTouchControls();
    
    // Set up UI handlers
    setupUIHandlers();
    
    // Start game loop
    game.lastUpdate = performance.now();
    requestAnimationFrame(gameLoop);
    
    console.log('[Game] Game client initialized');
}

/**
 * Resize canvas to fill container
 */
function resizeCanvas() {
    const container = document.getElementById('game-container');
    if (container && game.canvas) {
        game.canvas.width = container.clientWidth;
        game.canvas.height = container.clientHeight;
        
        // Recenter camera if in game
        if (game.localShip) {
            game.camera.x = game.localShip.x - game.canvas.width / 2;
            game.camera.y = game.localShip.y - game.canvas.height / 2;
        }
    }
}

/**
 * Set up keyboard input handlers
 */
function setupKeyboardInput() {
    document.addEventListener('keydown', (e) => {
        handleKeyDown(e.code, true);
    });
    
    document.addEventListener('keyup', (e) => {
        handleKeyUp(e.code, false);
    });
}

/**
 * Handle key down events
 */
function handleKeyDown(code, state) {
    // Ignore input if not in game
    if (game.phase !== 'playing') return;
    
    // Map key codes to actions
    switch (code) {
        case 'KeyW':
        case 'ArrowUp':
            game.inputs.thrust = state;
            break;
        case 'KeyS':
        case 'ArrowDown':
            game.inputs.brake = state;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            game.inputs.rotateLeft = state;
            break;
        case 'KeyD':
        case 'ArrowRight':
            game.inputs.rotateRight = state;
            break;
        case 'Space':
            game.inputs.firePrimary = state;
            break;
        case 'KeyE':
            game.inputs.fireSecondary = state;
            break;
        case 'KeyQ':
        case 'Digit1':
            if (state) game.inputs.activateAbility = 0;
            break;
        case 'KeyF':
        case 'Digit2':
            if (state) game.inputs.activateAbility = 1;
            break;
        case 'KeyR':
        case 'Digit3':
            if (state) game.inputs.activateAbility = 2;
            break;
    }
}

/**
 * Handle key up events
 */
function handleKeyUp(code, state) {
    // Ignore input if not in game
    if (game.phase !== 'playing') return;
    
    switch (code) {
        case 'KeyW':
        case 'ArrowUp':
            game.inputs.thrust = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            game.inputs.brake = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            game.inputs.rotateLeft = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            game.inputs.rotateRight = false;
            break;
        case 'Space':
            game.inputs.firePrimary = false;
            break;
        case 'KeyE':
            game.inputs.fireSecondary = false;
            break;
        case 'KeyQ':
        case 'Digit1':
        case 'KeyF':
        case 'Digit2':
        case 'KeyR':
        case 'Digit3':
            game.inputs.activateAbility = -1;
            break;
    }
}

/**
 * Set up touch controls for mobile
 */
function setupTouchControls() {
    const joystick = document.getElementById('joystick');
    const joystickStick = document.getElementById('joystick-stick');
    
    if (joystick && joystickStick) {
        let joystickData = { x: 0, y: 0, active: false };
        
        joystick.addEventListener('touchstart', (e) => {
            e.preventDefault();
            joystickData.active = true;
            
            const touch = e.touches[0];
            const rect = joystick.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            updateJoystickVisual(touch.clientX, touch.clientY, centerX, centerY, joystickStick, rect);
        });
        
        joystick.addEventListener('touchmove', (e) => {
            if (!joystickData.active) return;
            e.preventDefault();
            
            const touch = e.touches[0];
            const rect = joystick.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            updateJoystickVisual(touch.clientX, touch.clientY, centerX, centerY, joystickStick, rect);
        });
        
        joystick.addEventListener('touchend', () => {
            joystickData.active = false;
            joystickStick.style.transform = 'translate(-50%, -50%)';
            game.inputs.thrust = false;
            game.inputs.rotateLeft = false;
            game.inputs.rotateRight = false;
        });
    }
    
    // Fire button
    const fireBtn = document.getElementById('fire-btn');
    if (fireBtn) {
        fireBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            game.inputs.firePrimary = true;
        });
        
        fireBtn.addEventListener('touchend', () => {
            game.inputs.firePrimary = false;
        });
    }
}

/**
 * Update joystick visual position
 */
function updateJoystickVisual(touchX, touchY, centerX, centerY, stick, rect) {
    const maxDistance = rect.width / 2 - 30;
    let deltaX = touchX - centerX;
    let deltaY = touchY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance > maxDistance) {
        deltaX = (deltaX / distance) * maxDistance;
        deltaY = (deltaY / distance) * maxDistance;
    }
    
    stick.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
    
    // Update game inputs based on joystick position
    game.inputs.thrust = deltaY < -10;
    game.inputs.brake = deltaY > 10;
    game.inputs.rotateLeft = deltaX < -10;
    game.inputs.rotateRight = deltaX > 10;
}

/**
 * Set up UI event handlers
 */
function setupUIHandlers() {
    // Main menu buttons
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', () => connectToServer());
    }
    
    // Lobby buttons
    const redTeamBtn = document.getElementById('red-team-btn');
    const blueTeamBtn = document.getElementById('blue-team-btn');
    const readyBtn = document.getElementById('ready-btn');
    
    if (redTeamBtn) {
        redTeamBtn.addEventListener('click', () => selectTeam('red'));
    }
    
    if (blueTeamBtn) {
        blueTeamBtn.addEventListener('click', () => selectTeam('blue'));
    }
    
    if (readyBtn) {
        readyBtn.addEventListener('click', () => toggleReady());
    }
    
    // Chat
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    
    if (chatInput && chatSend) {
        chatSend.addEventListener('click', () => sendChatMessage(chatInput.value));
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage(chatInput.value);
            }
        });
    }
}

// ========================================
// Server Connection
// ========================================
function connectToServer() {
    const nameInput = document.getElementById('player-name');
    const colorInput = document.getElementById('player-color');
    
    const playerName = nameInput ? nameInput.value.trim() : 'Player';
    const playerColor = colorInput ? colorInput.value : '#00ff00';
    
    // Connect to server
    const serverUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : window.location.origin;
    
    game.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        query: {
            name: playerName,
            color: playerColor
        }
    });
    
    game.socket.on('connect', () => {
        console.log('[Socket] Connected to server');
        game.connected = true;
        showNotification('Connected to server', 'success');
    });
    
    game.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected from server:', reason);
        game.connected = false;
        showNotification('Disconnected from server: ' + reason, 'error');
        returnToMenu();
    });
    
    game.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
        showNotification('Failed to connect to server', 'error');
    });
    
    game.socket.on('init', (data) => {
        console.log('[Game] Received init data');
        game.playerId = data.playerId;
        game.localPlayer = data.gameState.players.find(p => p.id === game.playerId);
        
        // Apply game config
        if (data.config) {
            CONFIG.MAP_WIDTH = data.config.mapWidth || CONFIG.MAP_WIDTH;
            CONFIG.MAP_HEIGHT = data.config.mapHeight || CONFIG.MAP_HEIGHT;
        }
        
        showLobby();
    });
    
    game.socket.on('gameState', (state) => {
        updateGameState(state);
    });
    
    game.socket.on('playerList', (players) => {
        updatePlayerList(players);
    });
    
    game.socket.on('teamUpdate', (teams) => {
        updateTeamDisplay(teams);
    });
    
    game.socket.on('chat', (message) => {
        addChatMessage(message);
    });
    
    game.socket.on('notification', (data) => {
        showNotification(data.message, data.type || 'info');
    });
}

/**
 * Disconnect from server and return to menu
 */
function disconnectFromServer() {
    if (game.socket) {
        game.socket.disconnect();
        game.socket = null;
    }
    
    game.connected = false;
    game.playerId = null;
    game.localPlayer = null;
    game.localShip = null;
    game.players.clear();
    game.ships.clear();
    game.asteroids = [];
    game.projectiles = [];
}

/**
 * Return to main menu
 */
function returnToMenu() {
    disconnectFromServer();
    
    document.getElementById('main-menu').style.display = 'flex';
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-hud').style.display = 'none';
    
    game.phase = 'menu';
}

// ========================================
// Lobby Management
// ========================================
function showLobby() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    
    game.phase = 'lobby';
    
    showNotification('Welcome to the lobby!', 'success');
}

function selectTeam(team) {
    if (!game.socket || game.phase !== 'lobby') return;
    
    game.socket.emit('teamSelect', team);
    
    // Update UI
    document.querySelectorAll('.team-select-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    const btn = document.querySelector(`[data-team="${team}"]`);
    if (btn) {
        btn.classList.add('selected');
    }
}

function toggleReady() {
    if (!game.socket || game.phase !== 'lobby') return;
    
    // Ready toggle is handled by team selection
    // This function can be extended for additional ready logic
    console.log('[Game] Ready status toggled');
}

// ========================================
// Game State Updates
// ========================================
function updateGameState(state) {
    // Update game phase
    if (state.gamePhase !== game.phase) {
        game.phase = state.gamePhase;
        
        if (game.phase === 'playing') {
            document.getElementById('lobby-screen').style.display = 'none';
            document.getElementById('game-hud').style.display = 'block';
            document.getElementById('mobile-controls').classList.add('visible');
        }
    }
    
    // Update players
    state.players.forEach(p => {
        game.players.set(p.id, p);
        
        if (p.id === game.playerId) {
            game.localPlayer = p;
        }
    });
    
    // Update ships
    state.ships.forEach(s => {
        game.ships.set(s.id, s);
        
        if (s.playerId === game.playerId) {
            game.localShip = s;
            
            // Update camera to follow player
            game.camera.x = s.x - game.canvas.width / 2;
            game.camera.y = s.y - game.canvas.height / 2;
            
            // Update HUD
            updateHUD(s);
        }
    });
    
    // Update asteroids
    game.asteroids = state.asteroids || [];
    
    // Update projectiles
    game.projectiles = state.projectiles || [];
    
    // Update team scores
    if (state.teams) {
        updateTeamScores(state.teams);
    }
}

/**
 * Update player list in lobby
 */
function updatePlayerList(players) {
    // Validate color format before using in HTML
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    
    ['red', 'blue', 'neutral'].forEach(team => {
        const container = document.getElementById(`${team}-team-players`);
        if (!container) return;
        
        container.innerHTML = '';
        
        const teamPlayers = players.filter(p => p.team === team);
        
        teamPlayers.forEach(p => {
            // Validate color before using
            const validColor = colorRegex.test(p.color) ? p.color : '#888888';
            
            const playerDiv = document.createElement('div');
            playerDiv.className = 'team-player';
            playerDiv.innerHTML = `
                <div class="player-avatar" style="background-color: ${validColor}"></div>
                <span class="player-name">${p.name}</span>
                <span class="player-status">${p.id === game.playerId ? '(You)' : ''}</span>
            `;
            container.appendChild(playerDiv);
        });
    });
}

/**
 * Update team display
 */
function updateTeamDisplay(teams) {
    if (teams.red) {
        const redScore = document.getElementById('red-score');
        if (redScore) redScore.textContent = teams.red.score;
        
        const redCount = document.getElementById('red-player-count');
        if (redCount) redCount.textContent = `${teams.red.playerCount || 0} players`;
    }
    
    if (teams.blue) {
        const blueScore = document.getElementById('blue-score');
        if (blueScore) blueScore.textContent = teams.blue.score;
        
        const blueCount = document.getElementById('blue-player-count');
        if (blueCount) blueCount.textContent = `${teams.blue.playerCount || 0} players`;
    }
}

/**
 * Update team scores
 */
function updateTeamScores(teams) {
    if (teams.red) {
        const redScoreEl = document.getElementById('score-red');
        if (redScoreEl) redScoreEl.textContent = teams.red.score;
    }
    
    if (teams.blue) {
        const blueScoreEl = document.getElementById('score-blue');
        if (blueScoreEl) blueScoreEl.textContent = teams.blue.score;
    }
}

/**
 * Update HUD with player stats
 */
function updateHUD(ship) {
    // Health bar
    const healthFill = document.getElementById('health-fill');
    if (healthFill) {
        healthFill.style.width = `${(ship.health / ship.maxHealth) * 100}%`;
    }
    
    // Shield bar
    const shieldFill = document.getElementById('shield-fill');
    if (shieldFill) {
        shieldFill.style.width = `${(ship.shield / ship.maxShield) * 100}%`;
    }
    
    // Energy bar
    const energyFill = document.getElementById('energy-fill');
    if (energyFill) {
        energyFill.style.width = `${(ship.energy / ship.maxEnergy) * 100}%`;
    }
    
    // Player info
    if (game.localPlayer) {
        const nameEl = document.getElementById('player-info-name');
        if (nameEl) nameEl.textContent = game.localPlayer.name;
        
        const teamEl = document.getElementById('player-info-team');
        if (teamEl) {
            teamEl.textContent = game.localPlayer.team;
            teamEl.className = `player-info-team ${game.localPlayer.team}`;
        }
    }
    
    // Update minimap
    updateMinimap();
}

/**
 * Update minimap display
 */
function updateMinimap() {
    const minimap = document.getElementById('minimap');
    if (!minimap) return;
    
    minimap.innerHTML = '';
    
    // Scale factor
    const scale = 150 / CONFIG.MAP_WIDTH;
    
    // Draw ships
    game.ships.forEach(ship => {
        const dot = document.createElement('div');
        dot.className = 'minimap-dot';
        dot.style.left = `${ship.x * scale}px`;
        dot.style.top = `${ship.y * scale}px`;
        dot.style.backgroundColor = ship.color || '#ffffff';
        
        if (ship.playerId === game.playerId) {
            dot.classList.add('player');
        }
        
        minimap.appendChild(dot);
    });
}

// ========================================
// Chat System
// ========================================
function sendChatMessage(message) {
    if (!game.socket || !message.trim()) return;
    
    game.socket.emit('chat', message.trim());
    
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.value = '';
    }
}

function addChatMessage(data) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    if (data.sender) {
        // Validate color before using
        const colorRegex = /^#[0-9A-Fa-f]{6}$/;
        const validColor = colorRegex.test(data.color) ? data.color : '#888888';
        
        messageDiv.innerHTML = `<span class="sender" style="color: ${validColor}">${data.sender}:</span> ${escapeHtml(data.message)}`;
    } else {
        messageDiv.className += ' system';
        messageDiv.textContent = data.message;
    }
    
    messagesContainer.appendChild(messageDiv);
    
    // Limit message count
    while (messagesContainer.children.length > CONFIG.CHAT_MAX_MESSAGES) {
        messagesContainer.removeChild(messagesContainer.firstChild);
    }
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ========================================
// Notifications
// ========================================
function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
        <div class="notification-message">${escapeHtml(message)}</div>
    `;
    
    container.appendChild(notification);
    
    // Remove after duration
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, CONFIG.NOTIFICATION_DURATION);
}

// ========================================
// Game Loop
// ========================================
function gameLoop(timestamp) {
    game.deltaTime = timestamp - game.lastUpdate;
    game.lastUpdate = timestamp;
    
    // Send input to server
    sendInputToServer();
    
    // Send heartbeat
    sendHeartbeat();
    
    // Clear canvas
    clearCanvas();
    
    // Draw game
    if (game.phase === 'playing' || game.phase === 'lobby') {
        drawBackground();
        drawGrid();
        drawAsteroids();
        drawProjectiles();
        drawShips();
        drawUI();
    }
    
    requestAnimationFrame(gameLoop);
}

/**
 * Send input state to server
 */
function sendInputToServer() {
    if (!game.socket || game.phase !== 'playing') return;
    
    game.socket.emit('input', {
        inputs: {
            thrust: game.inputs.thrust,
            brake: game.inputs.brake,
            rotateLeft: game.inputs.rotateLeft,
            rotateRight: game.inputs.rotateRight,
            firePrimary: game.inputs.firePrimary,
            fireSecondary: game.inputs.fireSecondary,
            activateAbility: game.inputs.activateAbility
        }
    });
    
    // Reset ability activation after sending
    game.inputs.activateAbility = -1;
}

/**
 * Send heartbeat to server
 */
function sendHeartbeat() {
    if (!game.socket) return;
    
    game.socket.emit('heartbeat');
}

// ========================================
// Rendering
// ========================================
function clearCanvas() {
    const ctx = game.ctx;
    
    // Clear with background color
    ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
}

function drawBackground() {
    // Background is already drawn in clearCanvas
}

function drawGrid() {
    const ctx = game.ctx;
    const offsetX = game.camera.x % CONFIG.GRID_SIZE;
    const offsetY = game.camera.y % CONFIG.GRID_SIZE;
    
    ctx.strokeStyle = CONFIG.GRID_COLOR;
    ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = -offsetX; x < game.canvas.width; x += CONFIG.GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, game.canvas.height);
        ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = -offsetY; y < game.canvas.height; y += CONFIG.GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(game.canvas.width, y);
        ctx.stroke();
    }
}

function drawAsteroids() {
    const ctx = game.ctx;
    
    game.asteroids.forEach(asteroid => {
        const screenX = asteroid.x - game.camera.x;
        const screenY = asteroid.y - game.camera.y;
        
        // Skip if off screen
        if (screenX < -asteroid.radius || screenX > game.canvas.width + asteroid.radius ||
            screenY < -asteroid.radius || screenY > game.canvas.height + asteroid.radius) {
            return;
        }
        
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(asteroid.rotation);
        
        // Draw asteroid body
        ctx.fillStyle = '#444455';
        ctx.strokeStyle = '#666677';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        asteroid.vertices.forEach((vertex, i) => {
            const x = Math.cos(vertex.angle) * asteroid.radius * vertex.radius;
            const y = Math.sin(vertex.angle) * asteroid.radius * vertex.radius;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.restore();
    });
}

function drawShips() {
    const ctx = game.ctx;
    
    game.ships.forEach(ship => {
        const screenX = ship.x - game.camera.x;
        const screenY = ship.y - game.camera.y;
        
        // Skip if off screen
        if (screenX < -50 || screenX > game.canvas.width + 50 ||
            screenY < -50 || screenY > game.canvas.height + 50) {
            return;
        }
        
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(ship.rotation);
        
        // Draw ship body
        ctx.fillStyle = ship.color || '#888888';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        
        // Ship shape (triangle)
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(-15, 12);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-15, -12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw thrust if moving
        if (ship.thrust && ship.thrust > 0) {
            ctx.fillStyle = '#ff8800';
            ctx.beginPath();
            ctx.moveTo(-12, 0);
            ctx.lineTo(-25 - ship.thrust * 10, 0);
            ctx.lineTo(-12, 5);
            ctx.closePath();
            ctx.fill();
        }
        
        ctx.restore();
        
        // Draw name tag
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        
        const player = game.players.get(ship.playerId);
        if (player) {
            ctx.fillText(player.name, screenX, screenY - 35);
        }
        
        // Draw health bar
        const barWidth = 40;
        const barHeight = 4;
        const healthPercent = ship.health / ship.maxHealth;
        
        ctx.fillStyle = '#333333';
        ctx.fillRect(screenX - barWidth / 2, screenY - 28, barWidth, barHeight);
        
        ctx.fillStyle = healthPercent > 0.5 ? '#44ff44' : healthPercent > 0.25 ? '#ffaa00' : '#ff4444';
        ctx.fillRect(screenX - barWidth / 2, screenY - 28, barWidth * healthPercent, barHeight);
    });
}

function drawProjectiles() {
    const ctx = game.ctx;
    
    game.projectiles.forEach(proj => {
        const screenX = proj.x - game.camera.x;
        const screenY = proj.y - game.camera.y;
        
        // Skip if off screen
        if (screenX < -10 || screenX > game.canvas.width + 10 ||
            screenY < -10 || screenY > game.canvas.height + 10) {
            return;
        }
        
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 3, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawUI() {
    // Additional UI rendering if needed
}

// ========================================
// Utility Functions
// ========================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Start Game
// ========================================
document.addEventListener('DOMContentLoaded', initGame);

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { game, initGame, CONFIG };
}
