/**
 * Cosmic Deception - Voice Chat Module
 * WebRTC-based voice communication for multiplayer gaming
 */

// ========================================
// Voice Chat Configuration
// ========================================
// These constants define voice chat settings
const VOICE_CONFIG = {
    // STUN/TURN server configuration
    // Using Google's public STUN servers for NAT traversal
    // In production, you should deploy your own TURN server for reliability
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ],
    
    // Audio quality settings
    AUDIO_QUALITY: {
        sampleRate: 48000,
        channelCount: 1, // Mono audio for bandwidth efficiency
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    },
    
    // Voice activity detection settings
    VAD_SETTINGS: {
        threshold: 0.02, // Voice activity threshold (0-1)
        attackTime: 0.1, // Attack time in seconds
        releaseTime: 0.2 // Release time in seconds
    },
    
    // Push-to-talk settings
    PUSH_TO_TALK: {
        enabled: true,
        key: 'V', // Default PTT key
        bindDelay: 50 // Delay before voice activates after key press
    },
    
    // Connection settings
    CONNECTION: {
        maxBitrate: 64000, // Maximum bitrate in bps (64 kbps)
        minBitrate: 16000, // Minimum bitrate in bps (16 kbps)
        iceCandidatePoolSize: 10
    }
};

// ========================================
// Voice Chat State
// ========================================
const voiceChat = {
    // Connection state
    enabled: false,
    connected: false,
    socket: null,
    peerConnections: new Map(),
    localStream: null,
    
    // Audio state
    isTransmitting: false,
    isMuted: false,
    voiceLevel: 0,
    
    // User state
    localPlayerId: null,
    currentTeam: 'neutral',
    
    // Audio processing
    audioContext: null,
    analyser: null,
    microphone: null,
    pttPressed: false,
    
    // Timing
    lastHeartbeat: 0,
    heartbeatInterval: 5000,
    
    // Utility
    eventHandlers: new Map()
};

// ========================================
// Initialization
// ========================================
function initVoiceChat(socket) {
    console.log('[VoiceChat] Initializing voice chat...');
    
    // Store socket reference
    voiceChat.socket = socket;
    
    // Set up socket event handlers
    setupSocketHandlers();
    
    console.log('[VoiceChat] Voice chat initialized');
}

/**
 * Set up WebSocket event handlers for voice signaling
 */
function setupSocketHandlers() {
    if (!voiceChat.socket) {
        console.error('[VoiceChat] No socket available for setup');
        return;
    }
    
    // Handle incoming voice offers
    voiceChat.socket.on('voice-offer', handleVoiceOffer);
    
    // Handle incoming voice answers
    voiceChat.socket.on('voice-answer', handleVoiceAnswer);
    
    // Handle incoming ICE candidates
    voiceChat.socket.on('voice-ice-candidate', handleIceCandidate);
    
    // Handle peer disconnections
    voiceChat.socket.on('voice-peer-disconnected', handlePeerDisconnected);
    
    // Handle team changes
    voiceChat.socket.on('teamUpdate', handleTeamUpdate);
}

/**
 * Start voice chat for local player
 */
async function startVoiceChat() {
    if (voiceChat.enabled) {
        console.warn('[VoiceChat] Voice chat already enabled');
        return;
    }
    
    try {
        // Request microphone access
        voiceChat.localStream = await navigator.mediaDevices.getUserMedia({
            audio: VOICE_CONFIG.AUDIO_QUALITY
        });
        
        // Create audio context for analysis
        voiceChat.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: VOICE_CONFIG.AUDIO_QUALITY.sampleRate
        });
        
        // Set up audio analyser for voice activity detection
        const source = voiceChat.audioContext.createMediaStreamSource(voiceChat.localStream);
        voiceChat.analyser = voiceChat.audioContext.createAnalyser();
        voiceChat.analyser.fftSize = 256;
        source.connect(voiceChat.analyser);
        
        // Store microphone reference for later use
        voiceChat.microphone = voiceChat.localStream.getAudioTracks()[0];
        
        // Enable voice chat
        voiceChat.enabled = true;
        voiceChat.connected = true;
        
        console.log('[VoiceChat] Voice chat started successfully');
        
        // Notify user
        showNotification('Voice chat enabled', 'success');
        
        // Emit event
        emitVoiceEvent('enabled', { enabled: true });
        
        // Start voice activity monitoring
        monitorVoiceActivity();
        
    } catch (error) {
        console.error('[VoiceChat] Failed to start voice chat:', error);
        showNotification('Failed to access microphone: ' + error.message, 'error');
        
        // Don't throw - allow game to continue without voice
    }
}

/**
 * Stop voice chat
 */
function stopVoiceChat() {
    if (!voiceChat.enabled) {
        return;
    }
    
    // Close all peer connections
    voiceChat.peerConnections.forEach((pc, peerId) => {
        pc.close();
    });
    voiceChat.peerConnections.clear();
    
    // Stop local stream
    if (voiceChat.localStream) {
        voiceChat.localStream.getTracks().forEach(track => track.stop());
        voiceChat.localStream = null;
    }
    
    // Close audio context
    if (voiceChat.audioContext) {
        voiceChat.audioContext.close();
        voiceChat.audioContext = null;
    }
    
    // Reset state
    voiceChat.enabled = false;
    voiceChat.connected = false;
    voiceChat.isTransmitting = false;
    voiceChat.voiceLevel = 0;
    
    console.log('[VoiceChat] Voice chat stopped');
    
    // Emit event
    emitVoiceEvent('disabled', { disabled: true });
}

/**
 * Toggle mute state
 */
function toggleMute() {
    if (!voiceChat.enabled) {
        console.warn('[VoiceChat] Cannot toggle mute - voice chat not enabled');
        return;
    }
    
    voiceChat.isMuted = !voiceChat.isMuted;
    
    if (voiceChat.microphone) {
        voiceChat.microphone.enabled = !voiceChat.isMuted;
    }
    
    const status = voiceChat.isMuted ? 'muted' : 'unmuted';
    console.log(`[VoiceChat] Microphone ${status}`);
    showNotification(`Microphone ${status}`, 'info');
    
    emitVoiceEvent('muted', { isMuted: voiceChat.isMuted });
}

// ========================================
// Peer Connection Management
// ========================================
function createPeerConnection(peerId) {
    // Check if connection already exists
    if (voiceChat.peerConnections.has(peerId)) {
        console.log(`[VoiceChat] Peer connection already exists for ${peerId}`);
        return voiceChat.peerConnections.get(peerId);
    }
    
    // Create peer connection
    const pc = new RTCPeerConnection({
        iceServers: VOICE_CONFIG.ICE_SERVERS,
        iceCandidatePoolSize: VOICE_CONFIG.CONNECTION.iceCandidatePoolSize
    });
    
    // Add local stream tracks
    if (voiceChat.localStream) {
        voiceChat.localStream.getTracks().forEach(track => {
            pc.addTrack(track, voiceChat.localStream);
        });
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate && voiceChat.socket) {
            voiceChat.socket.emit('voice-ice-candidate', {
                target: peerId,
                candidate: event.candidate
            });
        }
    };
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log(`[VoiceChat] Connection state for ${peerId}: ${pc.connectionState}`);
        
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            handlePeerDisconnected({ peerId });
        }
    };
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
        console.log(`[VoiceChat] Received track from ${peerId}`);
        handleIncomingTrack(peerId, event.streams[0]);
    };
    
    // Store connection
    voiceChat.peerConnections.set(peerId, pc);
    
    return pc;
}

/**
 * Handle voice offer from signaling server
 */
async function handleVoiceOffer(data) {
    const { from, offer } = data;
    console.log(`[VoiceChat] Received offer from ${from}`);
    
    // Create or get peer connection
    const pc = createPeerConnection(from);
    
    // Set remote description
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    // Send answer back
    if (voiceChat.socket) {
        voiceChat.socket.emit('voice-answer', {
            target: from,
            answer: answer
        });
    }
}

/**
 * Handle voice answer from signaling server
 */
async function handleVoiceAnswer(data) {
    const { from, answer } = data;
    console.log(`[VoiceChat] Received answer from ${from}`);
    
    const pc = voiceChat.peerConnections.get(from);
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } else {
        console.warn(`[VoiceChat] No peer connection found for ${from}`);
    }
}

/**
 * Handle incoming ICE candidate
 */
async function handleIceCandidate(data) {
    const { from, candidate } = data;
    
    const pc = voiceChat.peerConnections.get(from);
    if (pc && candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('[VoiceChat] Error adding ICE candidate:', error);
        }
    }
}

/**
 * Handle peer disconnection
 */
function handlePeerDisconnected(data) {
    const { peerId } = data;
    console.log(`[VoiceChat] Peer disconnected: ${peerId}`);
    
    const pc = voiceChat.peerConnections.get(peerId);
    if (pc) {
        pc.close();
        voiceChat.peerConnections.delete(peerId);
    }
    
    // Remove audio element
    const audioElement = document.getElementById(`voice-audio-${peerId}`);
    if (audioElement) {
        audioElement.remove();
    }
    
    // Update UI
    updateVoiceParticipants();
}

/**
 * Handle incoming audio track
 */
function handleIncomingTrack(peerId, stream) {
    console.log(`[VoiceChat] Setting up audio for peer ${peerId}`);
    
    // Create audio element if it doesn't exist
    let audioElement = document.getElementById(`voice-audio-${peerId}`);
    
    if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.id = `voice-audio-${peerId}`;
        audioElement.autoplay = true;
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);
    }
    
    // Set stream
    audioElement.srcObject = stream;
    
    // Update UI
    updateVoiceParticipants();
}

/**
 * Initiate voice connection to a peer
 */
async function connectToPeer(peerId) {
    console.log(`[VoiceChat] Initiating connection to peer ${peerId}`);
    
    // Create peer connection
    const pc = createPeerConnection(peerId);
    
    // Create and send offer
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        if (voiceChat.socket) {
            voiceChat.socket.emit('voice-offer', {
                target: peerId,
                offer: offer
            });
        }
    } catch (error) {
        console.error('[VoiceChat] Error creating offer:', error);
    }
}

// ========================================
// Voice Activity Detection
// ========================================
function monitorVoiceActivity() {
    if (!voiceChat.enabled || !voiceChat.analyser) {
        return;
    }
    
    const bufferLength = voiceChat.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkInterval = setInterval(() => {
        if (!voiceChat.enabled) {
            clearInterval(checkInterval);
            return;
        }
        
        // Get voice level
        voiceChat.analyser.getByteFrequencyData(dataArray);
        
        // Calculate average level
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;
        voiceChat.voiceLevel = average / 255;
        
        // Check for voice activity
        const shouldTransmit = voiceChat.voiceLevel > VOICE_CONFIG.VAD_SETTINGS.threshold &&
                               !voiceChat.isMuted &&
                               (voiceChat.pttPressed || !VOICE_CONFIG.PUSH_TO_TALK.enabled);
        
        if (shouldTransmit !== voiceChat.isTransmitting) {
            voiceChat.isTransmitting = shouldTransmit;
            updateTransmitIndicator(shouldTransmit);
        }
        
        // Update voice level UI
        updateVoiceLevelUI();
        
    }, 50); // Check every 50ms
}

/**
 * Handle push-to-talk key press
 */
function handlePttKeyDown() {
    if (!VOICE_CONFIG.PUSH_TO_TALK.enabled || !voiceChat.enabled || voiceChat.pttPressed) {
        return;
    }
    
    voiceChat.pttPressed = true;
    
    // Small delay to prevent accidental activation
    setTimeout(() => {
        if (voiceChat.pttPressed) {
            console.log('[VoiceChat] Push-to-talk activated');
            emitVoiceEvent('ptt', { active: true });
        }
    }, VOICE_CONFIG.PUSH_TO_TALK.bindDelay);
}

/**
 * Handle push-to-talk key release
 */
function handlePttKeyUp() {
    if (!voiceChat.pttPressed) {
        return;
    }
    
    voiceChat.pttPressed = false;
    console.log('[VoiceChat] Push-to-talk deactivated');
    emitVoiceEvent('ptt', { active: false });
}

// ========================================
// UI Updates
// ========================================
function updateTransmitIndicator(isTransmitting) {
    const indicator = document.getElementById('voice-transmit-indicator');
    if (indicator) {
        indicator.style.opacity = isTransmitting ? '1' : '0.3';
        indicator.style.backgroundColor = isTransmitting ? '#44ff44' : '#666666';
    }
    
    // Emit event for external UI updates
    emitVoiceEvent('transmitting', { isTransmitting });
}

function updateVoiceLevelUI() {
    const levelBar = document.getElementById('voice-level-bar');
    if (levelBar) {
        const percentage = Math.min(100, voiceChat.voiceLevel * 200);
        levelBar.style.width = `${percentage}%`;
        
        // Color based on level
        if (percentage < 30) {
            levelBar.style.backgroundColor = '#44ff44';
        } else if (percentage < 70) {
            levelBar.style.backgroundColor = '#ffff44';
        } else {
            levelBar.style.backgroundColor = '#ff4444';
        }
    }
}

function updateVoiceParticipants() {
    // Update UI to show who's connected
    const container = document.getElementById('voice-participants');
    if (!container) return;
    
    const peerCount = voiceChat.peerConnections.size;
    container.textContent = `${peerCount} participant${peerCount !== 1 ? 's' : ''}`;
}

// ========================================
// Team Management
// ========================================
function handleTeamUpdate(data) {
    const newTeam = data.team;
    
    if (newTeam !== voiceChat.currentTeam) {
        console.log(`[VoiceChat] Team changed from ${voiceChat.currentTeam} to ${newTeam}`);
        
        // Close existing peer connections when changing teams
        // (Voice chat is team-only)
        if (voiceChat.peerConnections.size > 0) {
            console.log('[VoiceChat] Closing peer connections due to team change');
            
            voiceChat.peerConnections.forEach((pc, peerId) => {
                pc.close();
            });
            voiceChat.peerConnections.clear();
            
            // Remove all voice audio elements
            document.querySelectorAll('[id^="voice-audio-"]').forEach(el => {
                el.remove();
            });
        }
        
        voiceChat.currentTeam = newTeam;
        
        // Reconnect to teammates in new team
        if (voiceChat.enabled && newTeam !== 'neutral') {
            // Wait for player list to update, then connect to teammates
            setTimeout(() => {
                connectToTeammates();
            }, 1000);
        }
    }
}

/**
 * Connect to all teammates
 */
function connectToTeammates() {
    if (!game || !game.players) {
        return;
    }
    
    game.players.forEach((player, playerId) => {
        // Connect to players on the same team (excluding self)
        if (playerId !== game.playerId && player.team === voiceChat.currentTeam) {
            connectToPeer(playerId);
        }
    });
}

// ========================================
// Event System
// ========================================
function emitVoiceEvent(type, data) {
    const handlers = voiceChat.eventHandlers.get(type);
    if (handlers) {
        handlers.forEach(handler => handler(data));
    }
}

function onVoiceEvent(type, handler) {
    if (!voiceChat.eventHandlers.has(type)) {
        voiceChat.eventHandlers.set(type, new Set());
    }
    voiceChat.eventHandlers.get(type).add(handler);
}

function offVoiceEvent(type, handler) {
    const handlers = voiceChat.eventHandlers.get(type);
    if (handlers) {
        handlers.delete(handler);
    }
}

// ========================================
// Heartbeat System
// ========================================
function sendVoiceHeartbeat() {
    if (!voiceChat.socket || !voiceChat.enabled) {
        return;
    }
    
    const now = Date.now();
    if (now - voiceChat.lastHeartbeat < voiceChat.heartbeatInterval) {
        return;
    }
    
    voiceChat.lastHeartbeat = now;
    
    voiceChat.socket.emit('voice-heartbeat', {
        timestamp: now,
        team: voiceChat.currentTeam
    });
}

// ========================================
// Keyboard Event Handlers
// ========================================
document.addEventListener('keydown', (e) => {
    // Push-to-talk
    if (e.code === VOICE_CONFIG.PUSH_TO_TALK.key) {
        handlePttKeyDown();
    }
    
    // Toggle mute with M key
    if (e.code === 'KeyM' && voiceChat.enabled) {
        e.preventDefault();
        toggleMute();
    }
    
    // Enable voice chat with Z key
    if (e.code === 'KeyZ' && !voiceChat.enabled) {
        e.preventDefault();
        startVoiceChat();
    }
});

document.addEventListener('keyup', (e) => {
    // Push-to-talk release
    if (e.code === VOICE_CONFIG.PUSH_TO_TALK.key) {
        handlePttKeyUp();
    }
});

// ========================================
// Cleanup on Page Unload
// ========================================
window.addEventListener('beforeunload', () => {
    stopVoiceChat();
});

// ========================================
// Export for module usage
// ========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        voiceChat, 
        initVoiceChat, 
        startVoiceChat, 
        stopVoiceChat, 
        toggleMute,
        VOICE_CONFIG 
    };
}
