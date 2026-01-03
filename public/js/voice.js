/**
 * Voice Chat Module using WebRTC
 * Handles peer-to-peer voice communication
 */

class VoiceChat {
  constructor(options = {}) {
    this.socket = options.socket;
    this.playerId = options.playerId;
    
    this.localStream = null;
    this.audioContext = null;
    this.analyser = null;
    
    this.peerConnections = new Map();
    this.remoteStreams = new Map();
    this.remoteAudios = new Map();
    
    this.isMuted = false;
    this.isEnabled = true;
    this.isInitialized = false;
    
    this.peerId = null;
    
    this.onPeerJoin = options.onPeerJoin || (() => {});
    this.onPeerLeave = options.onPeerLeave || (() => {});
    this.onSpeaking = options.onSpeaking || (() => {});
    
    // ICE servers configuration
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
        // Add TURN servers via environment variables in production
      ]
    };
    
    this.speakingThreshold = 0.02;
  }
  
  /**
   * Initialize voice chat and get user permission for microphone
   */
  async init() {
    if (this.isInitialized) return;
    
    try {
      // Request microphone access
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        },
        video: false
      });
      
      // Create audio context for analysis
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      source.connect(this.analyser);
      
      this.isInitialized = true;
      console.log('Voice chat initialized');
      
      // Generate peer ID for WebRTC
      this.peerId = 'peer_' + Math.random().toString(36).substr(2, 9);
      
      // Notify server of our peer ID
      this.socket.emit('setPeerId', this.peerId);
      
      // Get existing peers in room
      this.socket.emit('getVoicePeers', (response) => {
        if (response.success) {
          response.peers.forEach(peer => {
            this.connectToPeer(peer.peerId, peer.playerId);
          });
        }
      });
      
      // Listen for new peers
      this.socket.on('peerIdUpdated', (data) => {
        if (data.playerId !== this.playerId) {
          // Connect to the new peer
          this.connectToPeer(data.peerId, data.playerId);
        }
      });
      
      // Listen for peers leaving
      this.socket.on('playerLeft', (data) => {
        this.disconnectFromPeer(data.playerId);
      });
      
      return true;
    } catch (error) {
      console.error('Failed to initialize voice chat:', error);
      return false;
    }
  }
  
  /**
   * Connect to a peer
   */
  connectToPeer(peerId, playerId) {
    if (this.peerConnections.has(playerId)) {
      return; // Already connected
    }
    
    const config = {
      iceServers: this.iceServers.iceServers,
      iceCandidatePoolSize: 10
    };
    
    const pc = new RTCPeerConnection(config);
    this.peerConnections.set(playerId, { pc, peerId });
    
    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      this.remoteStreams.set(playerId, stream);
      
      // Create audio element
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.muted = false;
      this.remoteAudios.set(playerId, audio);
      
      this.onPeerJoin(playerId);
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('iceCandidate', {
          targetPlayerId: playerId,
          candidate: event.candidate
        });
      }
    };
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${playerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.handleConnectionFailure(playerId);
      }
    };
    
    // Create and send offer
    this.createOffer(pc, playerId);
  }
  
  /**
   * Create offer for peer connection
   */
  async createOffer(pc, playerId) {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      
      await pc.setLocalDescription(offer);
      
      this.socket.emit('voiceOffer', {
        targetPlayerId: playerId,
        offer: offer,
        fromPeerId: this.peerId
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }
  
  /**
   * Handle incoming offer from peer
   */
  async handleOffer(data) {
    const { fromPlayerId, offer, fromPeerId } = data;
    
    if (this.peerConnections.has(fromPlayerId)) {
      return; // Already connected
    }
    
    const config = {
      iceServers: this.iceServers.iceServers,
      iceCandidatePoolSize: 10
    };
    
    const pc = new RTCPeerConnection(config);
    this.peerConnections.set(fromPlayerId, { pc, peerId: fromPeerId });
    
    // Add local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      this.remoteStreams.set(fromPlayerId, stream);
      
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.muted = false;
      this.remoteAudios.set(fromPlayerId, audio);
      
      this.onPeerJoin(fromPlayerId);
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('iceCandidate', {
          targetPlayerId: fromPlayerId,
          candidate: event.candidate
        });
      }
    };
    
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      this.socket.emit('voiceAnswer', {
        targetPlayerId: fromPlayerId,
        answer: answer,
        fromPeerId: this.peerId
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }
  
  /**
   * Handle answer from peer
   */
  async handleAnswer(data) {
    const { fromPlayerId, answer } = data;
    const connection = this.peerConnections.get(fromPlayerId);
    
    if (!connection) return;
      await connection.pc    
    try {
.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }
  
  /**
   * Handle ICE candidate from peer
   */
  async handleIceCandidate(data) {
    const { fromPlayerId, candidate } = data;
    const connection = this.peerConnections.get(fromPlayerId);
    
    if (!connection) return;
    
    try {
      await connection.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }
  
  /**
   * Disconnect from a peer
   */
  disconnectFromPeer(playerId) {
    const connection = this.peerConnections.get(playerId);
    
    if (connection) {
      connection.pc.close();
      this.peerConnections.delete(playerId);
    }
    
    const audio = this.remoteAudios.get(playerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.remoteAudios.delete(playerId);
    }
    
    this.remoteStreams.delete(playerId);
    this.onPeerLeave(playerId);
  }
  
  /**
   * Handle connection failure
   */
  handleConnectionFailure(playerId) {
    // Try to reconnect
    setTimeout(() => {
      const connection = this.peerConnections.get(playerId);
      if (connection && connection.pc.connectionState === 'failed') {
        this.disconnectFromPeer(playerId);
        
        // Get the peer's peerId from server
        this.socket.emit('getVoicePeers', (response) => {
          if (response.success) {
            const peer = response.peers.find(p => p.playerId === playerId);
            if (peer) {
              this.connectToPeer(peer.peerId, peer.playerId);
            }
          }
        });
      }
    }, 2000);
  }
  
  /**
   * Toggle mute state
   */
  toggleMute() {
    if (!this.localStream) return false;
    
    this.isMuted = !this.isMuted;
    
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });
    
    return this.isMuted;
  }
  
  /**
   * Set mute state
   */
  setMute(muted) {
    if (!this.localStream) return;
    
    this.isMuted = muted;
    
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }
  
  /**
   * Check if user is speaking
   */
  isSpeaking() {
    if (!this.analyser || this.isMuted) return false;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    
    return average > this.speakingThreshold * 255;
  }
  
  /**
   * Get speaking level (0-1)
   */
  getSpeakingLevel() {
    if (!this.analyser || this.isMuted) return 0;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    
    return Math.min(1, (sum / dataArray.length) / 128);
  }
  
  /**
   * Set volume for a specific peer
   */
  setPeerVolume(playerId, volume) {
    const audio = this.remoteAudios.get(playerId);
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume));
    }
  }
  
  /**
   * Set proximity volume based on distance
   */
  setProximityVolume(playerId, distance, maxDistance) {
    const volume = Math.max(0, 1 - (distance / maxDistance));
    this.setPeerVolume(playerId, volume);
  }
  
  /**
   * Enable/disable voice chat
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }
  
  /**
   * Clean up and disconnect
   */
  disconnect() {
    // Close all peer connections
    this.peerConnections.forEach((connection, playerId) => {
      connection.pc.close();
    });
    this.peerConnections.clear();
    
    // Stop all remote audio
    this.remoteAudios.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    this.remoteAudios.clear();
    this.remoteStreams.clear();
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isInitialized = false;
    console.log('Voice chat disconnected');
  }
  
  /**
   * Check if voice chat is supported
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && 
              window.RTCPeerConnection);
  }
}

// Export for use in game.js
window.VoiceChat = VoiceChat;
