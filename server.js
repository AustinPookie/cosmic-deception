// Cosmic Deception - Server Entry Point
// Multiplayer game server with real-time WebSocket communication

// Security Headers Middleware
const helmet = require('helmet');
const cors = require('cors');

// Game Configuration Constants
// These constants define core game settings that may need adjustment
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const MAX_PLAYERS = 16;
const GAME_TICK_RATE = 60; // Hz

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    // WebSocket configuration for optimal real-time performance
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling']
});

// Apply security headers including CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Enable CORS for development
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST']
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    etag: true
}));

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game State Management
const gameState = {
    players: new Map(),
    ships: new Map(),
    asteroids: [],
    projectiles: [],
    pickups: [],
    teams: {
        red: { score: 0, players: [] },
        blue: { score: 0, players: [] },
        neutral: { score: 0, players: [] }
    },
    gamePhase: 'lobby', // lobby, waiting, playing, ended
    roundStartTime: null,
    lastUpdate: Date.now()
};

// Initialize Asteroid Field
function initializeAsteroids(count = 50) {
    gameState.asteroids = [];
    for (let i = 0; i < count; i++) {
        gameState.asteroids.push({
            id: i,
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            radius: 20 + Math.random() * 40,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.02,
            vertices: generateAsteroidVertices()
        });
    }
}

// Generate random asteroid shape
function generateAsteroidVertices() {
    const vertices = [];
    const numVertices = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numVertices; i++) {
        const angle = (i / numVertices) * Math.PI * 2;
        const radius = 0.7 + Math.random() * 0.3;
        vertices.push({ angle, radius });
    }
    return vertices;
}

// Player Management
function createPlayer(id, data) {
    const player = {
        id,
        name: sanitizePlayerName(data.name) || `Player${id.slice(0, 4)}`,
        color: validateColor(data.color) || '#00ff00',
        shipId: null,
        team: 'neutral',
        score: 0,
        kills: 0,
        deaths: 0,
        connected: true,
        lastHeartbeat: Date.now()
    };
    
    gameState.players.set(id, player);
    return player;
}

function removePlayer(id) {
    const player = gameState.players.get(id);
    if (player) {
        // Remove from team
        if (player.team !== 'neutral') {
            const teamIndex = gameState.teams[player.team].players.indexOf(id);
            if (teamIndex > -1) gameState.teams[player.team].players.splice(teamIndex, 1);
        }
        
        // Remove player's ship
        if (player.shipId && gameState.ships.has(player.shipId)) {
            gameState.ships.delete(player.shipId);
        }
        
        gameState.players.delete(id);
    }
}

// Input Validation Functions
function sanitizePlayerName(name) {
    if (!name || typeof name !== 'string') return null;
    // Remove potentially dangerous characters and limit length
    return name.replace(/[<>"'&]/g, '').substring(0, 20).trim();
}

function validateColor(color) {
    if (!color || typeof color !== 'string') return null;
    // Validate hex color format
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    return colorRegex.test(color) ? color : null;
}

// Ship Management
function createShip(playerId, team) {
    const shipId = `ship_${playerId}`;
    const colors = {
        red: '#ff4444',
        blue: '#4444ff',
        neutral: '#aaaaaa'
    };
    
    const ship = {
        id: shipId,
        playerId,
        team,
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        rotation: Math.random() * Math.PI * 2,
        velocity: { x: 0, y: 0 },
        angularVelocity: 0,
        thrust: 0,
        color: colors[team] || colors.neutral,
        health: 100,
        maxHealth: 100,
        shield: 50,
        maxShield: 50,
        energy: 100,
        maxEnergy: 100,
        weapons: {
            primary: { cooldown: 0, maxCooldown: 10 },
            secondary: { cooldown: 0, maxCooldown: 120 },
            special: { cooldown: 0, maxCooldown: 600 }
        },
        powerups: [],
        flags: [],
        state: 'idle' // idle, moving, combat, destroyed
    };
    
    gameState.ships.set(shipId, ship);
    
    const player = gameState.players.get(playerId);
    if (player) {
        player.shipId = shipId;
    }
    
    return ship;
}

// Socket Connection Handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    // Create new player
    const player = createPlayer(socket.id, {
        name: socket.handshake.query.name,
        color: socket.handshake.query.color
    });
    
    // Send initial game state
    socket.emit('init', {
        playerId: socket.id,
        gameState: serializeGameState(),
        config: {
            mapWidth: MAP_WIDTH,
            mapHeight: MAP_HEIGHT,
            maxPlayers: MAX_PLAYERS
        }
    });
    
    // Handle player input
    socket.on('input', (data) => {
        handlePlayerInput(socket.id, data);
    });
    
    // Handle chat messages
    socket.on('chat', (message) => {
        handleChatMessage(socket.id, message);
    });
    
    // Handle team selection
    socket.on('teamSelect', (team) => {
        handleTeamSelection(socket.id, team);
    });
    
    // Handle ship controls
    socket.on('shipControl', (data) => {
        handleShipControl(socket.id, data);
    });
    
    // Handle weapon firing
    socket.on('fire', (weaponType) => {
        handleFireWeapon(socket.id, weaponType);
    });
    
    // Handle ability activation
    socket.on('ability', (abilityIndex) => {
        handleAbilityActivation(socket.id, abilityIndex);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        removePlayer(socket.id);
        broadcastPlayerList();
    });
    
    // Heartbeat for connection health
    socket.on('heartbeat', () => {
        const player = gameState.players.get(socket.id);
        if (player) {
            player.lastHeartbeat = Date.now();
        }
    });
    
    // Send current player list
    broadcastPlayerList();
});

// Input Handlers
function handlePlayerInput(playerId, data) {
    const player = gameState.players.get(playerId);
    if (!player) return;
    
    const ship = gameState.ships.get(player.shipId);
    if (!ship) return;
    
    // Update ship control states
    if (data.inputs) {
        ship.controls = {
            thrust: Boolean(data.inputs.thrust),
            brake: Boolean(data.inputs.brake),
            rotateLeft: Boolean(data.inputs.rotateLeft),
            rotateRight: Boolean(data.inputs.rotateRight),
            firePrimary: Boolean(data.inputs.firePrimary),
            fireSecondary: Boolean(data.inputs.fireSecondary),
            activateAbility: data.inputs.activateAbility !== undefined ? Number(data.inputs.activateAbility) : -1
        };
    }
}

function handleChatMessage(playerId, message) {
    const player = gameState.players.get(playerId);
    if (!player || !message) return;
    
    // Sanitize and limit message length
    const sanitizedMessage = String(message)
        .replace(/[<>"'&]/g, '')
        .substring(0, 200);
    
    if (sanitizedMessage.trim().length > 0) {
        io.emit('chat', {
            sender: player.name,
            message: sanitizedMessage,
            teamOnly: player.team !== 'neutral'
        });
    }
}

function handleTeamSelection(playerId, team) {
    const player = gameState.players.get(playerId);
    if (!player) return;
    
    const validTeams = ['red', 'blue', 'neutral'];
    const selectedTeam = validTeams.includes(team) ? team : 'neutral';
    
    // Remove from current team
    if (player.team !== 'neutral') {
        const currentTeamIndex = gameState.teams[player.team].players.indexOf(playerId);
        if (currentTeamIndex > -1) {
            gameState.teams[player.team].players.splice(currentTeamIndex, 1);
        }
    }
    
    // Add to new team
    player.team = selectedTeam;
    gameState.teams[selectedTeam].players.push(playerId);
    
    // Create or update ship
    if (selectedTeam !== 'neutral') {
        if (!player.shipId || !gameState.ships.has(player.shipId)) {
            createShip(playerId, selectedTeam);
        } else {
            const ship = gameState.ships.get(player.shipId);
            if (ship) {
                ship.team = selectedTeam;
            }
        }
    }
    
    broadcastTeamUpdates();
}

function handleShipControl(playerId, data) {
    const player = gameState.players.get(playerId);
    if (!player) return;
    
    const ship = gameState.ships.get(player.shipId);
    if (!ship) return;
    
    // Apply control inputs with validation
    if (typeof data.thrust === 'number' && data.thrust >= 0 && data.thrust <= 1) {
        ship.thrust = data.thrust;
    }
    
    if (typeof data.rotation === 'number' && isFinite(data.rotation)) {
        ship.rotation = data.rotation;
    }
}

function handleFireWeapon(playerId, weaponType) {
    const player = gameState.players.get(playerId);
    if (!player) return;
    
    const ship = gameState.ships.get(player.shipId);
    if (!ship) return;
    
    const weapons = ['primary', 'secondary', 'special'];
    const selectedWeapon = weapons.includes(weaponType) ? weaponType : 'primary';
    const weapon = ship.weapons[selectedWeapon];
    
    if (weapon.cooldown <= 0) {
        // Fire weapon logic here
        weapon.cooldown = weapon.maxCooldown;
        
        // Create projectile
        const projectile = {
            id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            shipId: ship.id,
            team: ship.team,
            x: ship.x + Math.cos(ship.rotation) * 20,
            y: ship.y + Math.sin(ship.rotation) * 20,
            velocity: {
                x: Math.cos(ship.rotation) * 10,
                y: Math.sin(ship.rotation) * 10
            },
            damage: selectedWeapon === 'primary' ? 10 : selectedWeapon === 'secondary' ? 30 : 50,
            lifetime: 100
        };
        
        gameState.projectiles.push(projectile);
    }
}

function handleAbilityActivation(playerId, abilityIndex) {
    const player = gameState.players.get(playerId);
    if (!player) return;
    
    const ship = gameState.ships.get(player.shipId);
    if (!ship) return;
    
    // Ability activation logic
    const abilities = ['shield', 'boost', 'repair'];
    if (abilityIndex >= 0 && abilityIndex < abilities.length) {
        const ability = abilities[abilityIndex];
        const energyCost = { shield: 30, boost: 20, repair: 40 };
        
        if (ship.energy >= energyCost[ability]) {
            ship.energy -= energyCost[ability];
            
            switch (ability) {
                case 'shield':
                    ship.shield = Math.min(ship.maxShield, ship.shield + 30);
                    break;
                case 'boost':
                    ship.thrust = Math.min(1, ship.thrust + 0.5);
                    break;
                case 'repair':
                    ship.health = Math.min(ship.maxHealth, ship.health + 20);
                    break;
            }
        }
    }
}

// Broadcast Functions
function broadcastPlayerList() {
    const playerList = Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        team: p.team,
        score: p.score
    }));
    
    io.emit('playerList', playerList);
}

function broadcastTeamUpdates() {
    const teams = {
        red: {
            score: gameState.teams.red.score,
            playerCount: gameState.teams.red.players.length
        },
        blue: {
            score: gameState.teams.blue.score,
            playerCount: gameState.teams.blue.players.length
        }
    };
    
    io.emit('teamUpdate', teams);
}

// Game Loop
function gameLoop() {
    const now = Date.now();
    const deltaTime = (now - gameState.lastUpdate) / 1000;
    gameState.lastUpdate = now;
    
    // Update all ships
    gameState.ships.forEach((ship, id) => {
        updateShip(ship, deltaTime);
    });
    
    // Update all projectiles
    updateProjectiles();
    
    // Update asteroids
    gameState.asteroids.forEach(asteroid => {
        asteroid.rotation += asteroid.rotationSpeed;
    });
    
    // Check for disconnected players (30 second timeout)
    gameState.players.forEach((player, id) => {
        if (now - player.lastHeartbeat > 30000) {
            removePlayer(id);
        }
    });
    
    // Broadcast game state
    io.emit('gameState', serializeGameState());
    
    // Update player list periodically
    if (Math.random() < 0.1) {
        broadcastPlayerList();
    }
}

// Ship Update Logic
function updateShip(ship, deltaTime) {
    // Rotation
    if (ship.controls) {
        if (ship.controls.rotateLeft) {
            ship.angularVelocity -= 0.1;
        }
        if (ship.controls.rotateRight) {
            ship.angularVelocity += 0.1;
        }
    }
    
    ship.rotation += ship.angularVelocity;
    ship.angularVelocity *= 0.9; // Damping
    
    // Thrust
    if (ship.controls && ship.controls.thrust) {
        ship.thrust = Math.min(1, ship.thrust + 0.1);
        ship.velocity.x += Math.cos(ship.rotation) * ship.thrust * 0.5;
        ship.velocity.y += Math.sin(ship.rotation) * ship.thrust * 0.5;
    } else {
        ship.thrust = Math.max(0, ship.thrust - 0.05);
    }
    
    // Apply velocity
    ship.x += ship.velocity.x;
    ship.y += ship.velocity.y;
    
    // Friction
    ship.velocity.x *= 0.99;
    ship.velocity.y *= 0.99;
    
    // Boundary wrapping
    if (ship.x < 0) ship.x = MAP_WIDTH;
    if (ship.x > MAP_WIDTH) ship.x = 0;
    if (ship.y < 0) ship.y = MAP_HEIGHT;
    if (ship.y > MAP_HEIGHT) ship.y = 0;
    
    // Update cooldowns
    Object.values(ship.weapons).forEach(weapon => {
        if (weapon.cooldown > 0) weapon.cooldown--;
    });
    
    // Shield regeneration
    if (ship.shield < ship.maxShield) {
        ship.shield = Math.min(ship.maxShield, ship.shield + 0.05);
    }
    
    // Energy regeneration
    if (ship.energy < ship.maxEnergy) {
        ship.energy = Math.min(ship.maxEnergy, ship.energy + 0.1);
    }
}

// Projectile Update Logic
function updateProjectiles() {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const proj = gameState.projectiles[i];
        
        // Move projectile
        proj.x += proj.velocity.x;
        proj.y += proj.velocity.y;
        proj.lifetime--;
        
        // Check collision with ships
        gameState.ships.forEach((ship, shipId) => {
            if (shipId !== proj.shipId) {
                const dx = ship.x - proj.x;
                const dy = ship.y - proj.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 20) {
                    // Hit detected
                    proj.lifetime = 0;
                    
                    if (ship.shield > 0) {
                        ship.shield = Math.max(0, ship.shield - proj.damage);
                    } else {
                        ship.health -= proj.damage;
                        
                        if (ship.health <= 0) {
                            // Ship destroyed
                            handleShipDestruction(shipId, proj.shipId);
                        }
                    }
                }
            }
        });
        
        // Remove expired or out of bounds projectiles
        if (proj.lifetime <= 0 ||
            proj.x < 0 || proj.x > MAP_WIDTH ||
            proj.y < 0 || proj.y > MAP_HEIGHT) {
            gameState.projectiles.splice(i, 1);
        }
    }
}

function handleShipDestruction(destroyedShipId, killerShipId) {
    const destroyedShip = gameState.ships.get(destroyedShipId);
    const killerShip = gameState.ships.get(killerShipId);
    
    if (destroyedShip) {
        const player = gameState.players.get(destroyedShip.playerId);
        if (player) {
            player.deaths++;
            player.score = Math.max(0, player.score - 50);
            
            // Respawn after delay
            setTimeout(() => {
                if (gameState.players.has(destroyedShip.playerId)) {
                    createShip(destroyedShip.playerId, player.team);
                }
            }, 5000);
        }
        
        gameState.ships.delete(destroyedShipId);
    }
    
    if (killerShip) {
        const killerPlayer = gameState.players.get(killerShip.playerId);
        if (killerPlayer) {
            killerPlayer.kills++;
            killerPlayer.score += 100;
            
            // Update team score
            if (killerShip.team !== 'neutral') {
                gameState.teams[killerShip.team].score += 100;
            }
        }
    }
}

// Serialize game state for network transmission
function serializeGameState() {
    return {
        players: Array.from(gameState.players.entries()).map(([id, player]) => ({
            id,
            name: player.name,
            color: player.color,
            team: player.team,
            score: player.score,
            connected: player.connected
        })),
        ships: Array.from(gameState.ships.entries()).map(([id, ship]) => ({
            id,
            playerId: ship.playerId,
            team: ship.team,
            x: Math.round(ship.x * 100) / 100,
            y: Math.round(ship.y * 100) / 100,
            rotation: Math.round(ship.rotation * 1000) / 1000,
            health: ship.health,
            shield: Math.round(ship.shield),
            color: ship.color
        })),
        asteroids: gameState.asteroids.map(a => ({
            id: a.id,
            x: Math.round(a.x * 100) / 100,
            y: Math.round(a.y * 100) / 100,
            radius: Math.round(a.radius),
            rotation: Math.round(a.rotation * 1000) / 1000
        })),
        projectiles: gameState.projectiles.map(p => ({
            id: p.id,
            team: p.team,
            x: Math.round(p.x * 100) / 100,
            y: Math.round(p.y * 100) / 100,
            velocityX: Math.round(p.velocity.x * 100) / 100,
            velocityY: Math.round(p.velocity.y * 100) / 100
        })),
        teams: {
            red: { score: gameState.teams.red.score },
            blue: { score: gameState.teams.blue.score }
        },
        gamePhase: gameState.gamePhase,
        timestamp: Date.now()
    };
}

// Initialize game
initializeAsteroids();

// Start game loop at specified tick rate
setInterval(gameLoop, 1000 / GAME_TICK_RATE);

// Clean up idle connections periodically
setInterval(() => {
    const now = Date.now();
    let suspiciousCount = 0;
    
    gameState.players.forEach((player, id) => {
        if (now - player.lastHeartbeat > 60000) {
            suspiciousCount++;
        }
    });
    
    if (suspiciousCount > 5) {
        // Only log in development to avoid noise in production
        if (process.env.NODE_ENV === 'development') {
            console.warn(`High number of inactive connections: ${suspiciousCount}`);
        }
    }
}, 30000);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Cosmic Deception server running on port ${PORT}`);
    console.log(`Map size: ${MAP_WIDTH}x${MAP_HEIGHT}`);
    console.log(`Max players: ${MAX_PLAYERS}`);
});
