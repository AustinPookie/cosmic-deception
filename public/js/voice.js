/**
 * Voice Chat Module using WebRTC
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
    this.isInitialized = false;
    
    this.peerId = null;
    
    this.onPeerJoin = options.onPeerJoin || (() => {});
    this.onPeerLeave = options.onPeerLeave || (() => {});
    
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
  }
  
  async init() {
    if (this.isInitialized) return;
    
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      source.connect(this.analyser);
      
      this.isInitialized = true;
      console.log('Voice chat initialized');
      
      this.peerId = 'peer_' + Math.random().toString(36).substr(2, 9);
      this.socket.emit('setPeerId', this.peerId);
      
      this.socket.emit('getVoicePeers', (response) => {
        if (response.success) {
          response.peers.forEach(peer => {
            this.connectToPeer(peer.peerId, peer.playerId);
          });
        }
      });
      
      this.socket.on('peerIdUpdated', (data) => {
        if (data.playerId !== this.playerId) {
          this.connectToPeer(data.peerId, data.playerId);
        }
      });
      
      this.socket.on('playerLeft', (data) => {
        this.disconnectFromPeer(data.playerId);
      });
      
      return true;
    } catch (error) {
      console.error('Failed to initialize voice chat:', error);
      return false;
    }
  }
  
  connectToPeer(peerId, playerId) {
    if (this.peerConnections.has(playerId)) return;
    
    const pc = new RTCPeerConnection(this.iceServers);
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
    
    this.createOffer(pc, playerId);
  }
  
  async createOffer(pc, playerId) {
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
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
  
  async handleOffer(data) {
    const { fromPlayerId, offer, fromPeerId } = data;
    if (this.peerConnections.has(fromPlayerId)) return;
    
    const pc = new RTCPeerConnection(this.iceServers);
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
      console.error('Error handling offer:', error);
    }
  }
  
  async handleAnswer(data) {
    const { fromPlayerId, answer } = data;
    const connection = this.peerConnections.get(fromPlayerId);
    if (!connection) return;
    
    try {
      await connection.pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }
  
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
    
    return average > 5;
  }
  
  disconnect() {
    this.peerConnections.forEach((connection, playerId) => {
      connection.pc.close();
    });
    this.peerConnections.clear();
    
    this.remoteAudios.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    this.remoteAudios.clear();
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isInitialized = false;
  }
  
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && 
              window.RTCPeerConnection);
  }
}

window.VoiceChat = VoiceChat;
