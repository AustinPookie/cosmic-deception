/**
 * Virtual Joystick for Mobile Game Controls
 * Handles touch events and provides movement data
 */

class VirtualJoystick {
  constructor(options = {}) {
    this.zone = document.getElementById(options.zoneId || 'joystick-zone');
    this.base = document.getElementById(options.baseId || 'joystick-base');
    this.stick = document.getElementById(options.stickId || 'joystick-stick');
    
    this.maxRadius = options.maxRadius || 50;
    this.sensitivity = options.sensitivity || 1;
    
    this.active = false;
    this.touchId = null;
    this.useMouse = false;
    this.centerX = 0;
    this.centerY = 0;
    this.currentX = 0;
    this.currentY = 0;
    
    this.onMove = options.onMove || (() => {});
    this.onEnd = options.onEnd || (() => {});
    
    this.init();
  }
  
  init() {
    // Touch events
    this.zone.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    this.zone.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.zone.addEventListener('touchend', this.handleTouchEnd.bind(this));
    this.zone.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
    
    // Mouse events (for testing)
    this.zone.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
  }
  
  handleTouchStart(e) {
    e.preventDefault();
    
    if (this.active) return;
    
    const touch = e.changedTouches[0];
    this.touchId = touch.identifier;
    this.active = true;
    
    const rect = this.base.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    
    this.updatePosition(touch.clientX, touch.clientY);
    
    this.base.classList.add('active');
  }
  
  handleTouchMove(e) {
    if (!this.active) return;
    
    e.preventDefault();
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.touchId) {
        this.updatePosition(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        break;
      }
    }
  }
  
  handleTouchEnd(e) {
    if (!this.active) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.touchId) {
        this.reset();
        break;
      }
    }
  }
  
  handleMouseDown(e) {
    if (this.active) return;
    
    this.active = true;
    this.useMouse = true;
    
    const rect = this.base.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    
    this.updatePosition(e.clientX, e.clientY);
    this.base.classList.add('active');
  }
  
  handleMouseMove(e) {
    if (!this.active || !this.useMouse) return;
    this.updatePosition(e.clientX, e.clientY);
  }
  
  handleMouseUp(e) {
    if (!this.active || !this.useMouse) return;
    this.reset();
  }
  
  updatePosition(clientX, clientY) {
    const dx = clientX - this.centerX;
    const dy = clientY - this.centerY;
    
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    const clampedDistance = Math.min(distance, this.maxRadius);
    
    this.currentX = clampedDistance * Math.cos(angle);
    this.currentY = clampedDistance * Math.sin(angle);
    
    // Update visual stick position
    this.stick.style.transform = `translate(calc(-50% + ${this.currentX}px), calc(-50% + ${this.currentY}px))`;
    
    // Calculate normalized movement (0-1)
    const normalizedX = (this.currentX / this.maxRadius) * this.sensitivity;
    const normalizedY = (this.currentY / this.maxRadius) * this.sensitivity;
    
    // Call movement callback
    this.onMove({
      x: normalizedX,
      y: normalizedY,
      magnitude: clampedDistance / this.maxRadius,
      angle: angle
    });
  }
  
  reset() {
    this.active = false;
    this.touchId = null;
    this.useMouse = false;
    
    this.currentX = 0;
    this.currentY = 0;
    
    this.stick.style.transform = 'translate(-50%, -50%)';
    this.base.classList.remove('active');
    
    this.onEnd();
  }
  
  getPosition() {
    return {
      x: this.currentX,
      y: this.currentY
    };
  }
  
  getNormalizedDirection() {
    const magnitude = Math.sqrt(this.currentX * this.currentX + this.currentY * this.currentY);
    
    if (magnitude === 0) {
      return { x: 0, y: 0 };
    }
    
    return {
      x: this.currentX / magnitude,
      y: this.currentY / magnitude
    };
  }
  
  isActive() {
    return this.active;
  }
}

// Export for use in game.js
window.VirtualJoystick = VirtualJoystick;
