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
    
    // Array to store socket listener references for cleanup
    this.socketListeners = [];
    
    // ICE servers configuration
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
    
    this.speakingThreshold = 0.02;
  }
  
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
      
      // FIX: Resume AudioContext if suspended (browser auto-play policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('[VoiceChat] AudioContext resumed from suspended state');
      }
      
      this.isInitialized = true;
      console.log('[VoiceChat] Voice chat initialized');
      
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
      
      // Listen for new peers - store reference for cleanup
      const peerIdListener = (data) => {
        if (data.playerId !== this.playerId) {
          this.connectToPeer(data.peerId, data.playerId);
        }
      };
      this.socket.on('peerIdUpdated', peerIdListener);
      this.socketListeners.push({ event: 'peerIdUpdated', listener: peerIdListener });
      
      // Listen for peers leaving - store reference for cleanup
      const playerLeftListener = (data) => {
        this.disconnectFromPeer(data.playerId);
      };
      this.socket.on('playerLeft', playerLeftListener);
      this.socketListeners.push({ event: 'playerLeft', listener: playerLeftListener });
      
      return true;
    } catch (error) {
      console.error('[VoiceChat] Failed to initialize voice chat:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        this.showPermissionDeniedUI();
      }
      
      return false;
    }
  }
  
  showPermissionDeniedUI() {
    if (window.game) {
      window.game.showToast('Microphone access denied. Voice chat disabled.', 'error');
    }
    
    const muteBtn = document.getElementById('mute-btn');
    const voiceBtn = document.getElementById('voice-btn');
    
    if (muteBtn) {
      muteBtn.classList.add('disabled');
      muteBtn.disabled = true;
    }
    
    if (voiceBtn) {
      voiceBtn.classList.add('disabled');
    }
    
    const voiceControls = document.querySelector('.voice-controls');
    if (voiceControls) {
      voiceControls.classList.add('disabled');
    }
  }
  
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
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }
    
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      this.remoteStreams.set(playerId, stream);
      
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.muted = false;
      this.remoteAudios.set(playerId, audio);
      
      this.onPeerJoin(playerId);
    };
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('iceCandidate', {
          targetPlayerId: playerId,
          candidate: event.candidate
        });
      }
    };
    
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${playerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.handleConnectionFailure(playerId);
      }
    };
    
    this.createOffer(pc, playerId);
  }
  
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
      console.error('[VoiceChat] Error creating offer:', error);
    }
  }
  
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
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }
    
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
      console.error('[VoiceChat] Error handling offer:', error);
    }
  }
  
  async handleAnswer(data) {
    const { fromPlayerId, answer } = data;
    const connection = this.peerConnections.get(fromPlayerId);
    
    if (!connection) return;
    
    try {
      await connection.pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('[VoiceChat] Error handling answer:', error);
    }
  }
  
  async handleIceCandidate(data) {
    const { fromPlayerId, candidate } = data;
    const connection = this.peerConnections.get(fromPlayerId);
    
    if (!connection) return;
    
    try {
      await connection.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[VoiceChat] Error adding ICE candidate:', error);
    }
  }
  
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
  
  handleConnectionFailure(playerId) {
    setTimeout(() => {
      const connection = this.peerConnections.get(playerId);
      if (connection && connection.pc.connectionState === 'failed') {
        this.disconnectFromPeer(playerId);
        
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
  
  toggleMute() {
    if (!this.localStream) return false;
    
    this.isMuted = !this.isMuted;
    
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });
    
    return this.isMuted;
  }
  
  setMute(muted) {
    if (!this.localStream) return;
    
    this.isMuted = muted;
    
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }
  
  isSpeaking() {
    if (!this.analyser || this.isMuted) return false;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    
    return average > this.speakingThreshold * 255;
  }
  
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
  
  setPeerVolume(playerId, volume) {
    const audio = this.remoteAudios.get(playerId);
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume));
    }
  }
  
  setProximityVolume(playerId, distance, maxDistance) {
    const volume = Math.max(0, 1 - (distance / maxDistance));
    this.setPeerVolume(playerId, volume);
  }
  
  setEnabled(enabled) {
    this.isEnabled = enabled;
    
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }
  
  disconnect() {
    // FIX: Remove all socket event listeners to prevent memory leaks
    this.socketListeners.forEach(({ event, listener }) => {
      this.socket.off(event, listener);
    });
    this.socketListeners = [];
    
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
    console.log('[VoiceChat] Voice chat disconnected');
  }
  
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && 
              window.RTCPeerConnection);
  }
}

// Export for use in game.js
window.VoiceChat = VoiceChat;
