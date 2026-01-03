/**
 * Virtual Joystick for Mobile Game Controls
 * Handles touch events and provides movement data
 * Supports multi-touch, dynamic positioning, and visual feedback
 */

// Configuration defaults
const JOYSTICK_DEFAULTS = {
  maxRadius: 50,           // Maximum distance stick can travel from center
  sensitivity: 1.0,         // Movement sensitivity multiplier
  deadZone: 10,             // Minimum distance before movement is registered
  inverseY: false,          // Invert Y-axis movement
  lockToZone: false,        // Lock stick movement to joystick zone
  followTouch: true,        // Base follows initial touch position
  showTrail: false,         // Visual trail effect
  zoneColor: 'transparent', // Zone background color
  baseColor: 'rgba(255, 255, 255, 0.1)', // Base element color
  stickColor: 'rgba(255, 255, 255, 0.8)', // Stick element color
  baseSize: 120,            // Base element size in pixels
  stickSize: 50,            // Stick element size in pixels
  enableMouse: true,        // Enable mouse events for testing
  enableHover: false,       // Enable hover events
  debug: false              // Debug mode flag
};

class VirtualJoystick {
  constructor(options = {}) {
    // Merge user options with defaults
    this.config = { ...JOYSTICK_DEFAULTS, ...options };

    // DOM element references - with null safety
    this.zone = null;
    this.base = null;
    this.stick = null;

    // Core state
    this.active = false;
    this.touchId = null;
    this.useMouse = false;

    // Position tracking
    this.centerX = 0;
    this.centerY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.startX = 0;
    this.startY = 0;

    // Movement data
    this.velocityX = 0;
    this.velocityY = 0;
    this.lastMoveTime = 0;
    this.moveHistory = [];

    // Touch tracking
    this.trackedTouches = new Map();
    this.maxTrackedTouches = 2;

    // State flags
    this.enabled = true;
    this.visible = true;
    this.debugMode = this.config.debug;
    this.initialized = false;

    // Event callbacks
    this.onMove = this.config.onMove || (() => {});
    this.onStart = this.config.onStart || (() => {});
    this.onEnd = this.config.onEnd || (() => {});
    this.onZoneEnter = this.config.onZoneEnter || (() => {});
    this.onZoneLeave = this.config.onZoneLeave || (() => {});

    // Performance tracking
    this.frameCount = 0;
    this.lastFrameTime = performance.now();

    // Bound methods for event listener removal
    this._boundTouchStart = this.handleTouchStart.bind(this);
    this._boundTouchMove = this.handleTouchMove.bind(this);
    this._boundTouchEnd = this.handleTouchEnd.bind(this);
    this._boundTouchCancel = this.handleTouchEnd.bind(this);
    this._boundMouseDown = this.handleMouseDown.bind(this);
    this._boundMouseMove = this.handleMouseMove.bind(this);
    this._boundMouseUp = this.handleMouseUp.bind(this);

    // Initialize
    this.init();
  }

  init() {
    // Get DOM elements
    this.zone = document.getElementById(this.config.zoneId || 'joystick-zone');
    this.base = document.getElementById(this.config.baseId || 'joystick-base');
    this.stick = document.getElementById(this.config.stickId || 'joystick-stick');

    // Safety check - create elements if they don't exist
    if (!this.zone) {
      console.warn('[Joystick] Joystick zone element not found. Creating dynamically.');
      this.zone = this.createJoystickElements();
    }

    // Double check after potential creation
    if (!this.zone || !this.base || !this.stick) {
      console.error('[Joystick] Cannot initialize - required DOM elements missing');
      return;
    }

    this.log('[Joystick] Initializing with config:', this.config);

    // Touch events - use passive: false to allow preventDefault
    this.zone.addEventListener('touchstart', this._boundTouchStart, { passive: false });
    this.zone.addEventListener('touchmove', this._boundTouchMove, { passive: false });
    this.zone.addEventListener('touchend', this._boundTouchEnd);
    this.zone.addEventListener('touchcancel', this._boundTouchCancel);

    // Mouse events (for desktop testing)
    if (this.config.enableMouse !== false) {
      this.zone.addEventListener('mousedown', this._boundMouseDown);
      document.addEventListener('mousemove', this._boundMouseMove);
      document.addEventListener('mouseup', this._boundMouseUp);
    }

    // Zone hover events
    if (this.config.enableHover !== false) {
      this.zone.addEventListener('mouseenter', () => this.onZoneEnter());
      this.zone.addEventListener('mouseleave', () => this.onZoneLeave());
    }

    // Initialize position
    this.updateBasePosition();
    this.initialized = true;
    this.log('[Joystick] Initialization complete');
  }

  createJoystickElements() {
    try {
      // Create joystick zone
      const zone = document.createElement('div');
      zone.id = 'joystick-zone';
      zone.className = 'joystick-zone';

      // Style the zone
      Object.assign(zone.style, {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        width: '200px',
        height: '200px',
        zIndex: '1000',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      });

      // Create base
      this.base = document.createElement('div');
      this.base.id = 'joystick-base';
      this.base.className = 'joystick-base';

      Object.assign(this.base.style, {
        position: 'absolute',
        width: `${this.config.baseSize}px`,
        height: `${this.config.baseSize}px`,
        borderRadius: '50%',
        backgroundColor: this.config.baseColor,
        border: '2px solid rgba(255, 255, 255, 0.2)',
        transform: 'translate(-50%, -50%)'
      });

      // Create stick
      this.stick = document.createElement('div');
      this.stick.id = 'joystick-stick';
      this.stick.className = 'joystick-stick';

      Object.assign(this.stick.style, {
        position: 'absolute',
        width: `${this.config.stickSize}px`,
        height: `${this.config.stickSize}px`,
        borderRadius: '50%',
        backgroundColor: this.config.stickColor,
        transform: 'translate(-50%, -50%)',
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.3)'
      });

      // Assemble
      zone.appendChild(this.base);
      zone.appendChild(this.stick);
      document.body.appendChild(zone);

      return zone;
    } catch (error) {
      console.error('[Joystick] Error creating joystick elements:', error);
      return null;
    }
  }

  handleTouchStart(e) {
    if (!this.enabled || this.active) return;

    // Find the first changed touch
    const touch = e.changedTouches[0];
    if (!touch) return;

    e.preventDefault();

    this.log('[Joystick] Touch start:', touch.identifier);

    // Store touch ID
    this.touchId = touch.identifier;
    this.active = true;

    // Record start position
    this.startX = touch.clientX;
    this.startY = touch.clientY;

    // Calculate center position
    if (this.config.followTouch) {
      this.centerX = touch.clientX;
      this.centerY = touch.clientY;
      this.updateBasePosition();
    } else {
      this.updateBasePosition();
    }

    // Update position
    this.updatePosition(touch.clientX, touch.clientY);

    // Visual feedback
    if (this.base) this.base.classList.add('active');
    if (this.zone) this.zone.classList.add('active');

    // Trigger start callback
    this.onStart({
      x: touch.clientX,
      y: touch.clientY,
      touchId: this.touchId
    });
  }

  handleTouchMove(e) {
    if (!this.active) return;

    e.preventDefault();

    // Find our tracked touch
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.touchId) {
        this.updatePosition(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  handleTouchEnd(e) {
    if (!this.active) return;

    // Check if our touch ended
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.touchId) {
        this.log('[Joystick] Touch end:', touch.identifier);
        this.reset();
        break;
      }
    }
  }

  handleMouseDown(e) {
    if (!this.enabled || this.active) return;

    this.log('[Joystick] Mouse down');

    this.active = true;
    this.useMouse = true;

    // Record start position
    this.startX = e.clientX;
    this.startY = e.clientY;

    // Calculate center position
    if (this.config.followTouch) {
      this.centerX = e.clientX;
      this.centerY = e.clientY;
      this.updateBasePosition();
    } else {
      this.updateBasePosition();
    }

    // Update position
    this.updatePosition(e.clientX, e.clientY);

    // Visual feedback
    if (this.base) this.base.classList.add('active');
    if (this.zone) this.zone.classList.add('active');

    // Trigger start callback
    this.onStart({
      x: e.clientX,
      y: e.clientY,
      isMouse: true
    });
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
    // Null safety checks
    if (!this.base || !this.stick) return;

    // Calculate delta from center
    let dx = clientX - this.centerX;
    let dy = clientY - this.centerY;

    // Apply inverse Y if configured
    if (this.config.inverseY) {
      dy = -dy;
    }

    // Calculate distance and angle
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // Apply dead zone
    let clampedDistance = distance;
    if (distance > this.config.deadZone) {
      clampedDistance = Math.min(distance, this.config.maxRadius);
    } else {
      clampedDistance = 0;
      dx = 0;
      dy = 0;
    }

    // Lock to zone if configured
    if (this.config.lockToZone && distance > this.config.maxRadius) {
      dx = this.config.maxRadius * Math.cos(angle);
      dy = this.config.maxRadius * Math.sin(angle);
      clampedDistance = this.config.maxRadius;
    }

    // Update current position
    this.currentX = dx;
    this.currentY = dy;

    // Calculate velocity
    const now = performance.now();
    const deltaTime = now - this.lastMoveTime;

    if (deltaTime > 0 && this.moveHistory.length > 0) {
      this.velocityX = (this.currentX - this.moveHistory[0].x) / deltaTime * 16;
      this.velocityY = (this.currentY - this.moveHistory[0].y) / deltaTime * 16;
    }

    // Update move history
    this.moveHistory.unshift({
      x: this.currentX,
      y: this.currentY,
      time: now
    });

    // Keep only recent history
    if (this.moveHistory.length > 10) {
      this.moveHistory.pop();
    }

    this.lastMoveTime = now;

    // Update visual stick position
    this.stick.style.transform = `translate(calc(-50% + ${this.currentX}px), calc(-50% + ${this.currentY}px))`;

    // Calculate normalized movement (0-1)
    const normalizedX = (this.currentX / this.config.maxRadius) * this.config.sensitivity;
    const normalizedY = (this.currentY / this.config.maxRadius) * this.config.sensitivity;

    // Clamp normalized values to [-1, 1]
    const clampedX = Math.max(-1, Math.min(1, normalizedX));
    const clampedY = Math.max(-1, Math.min(1, normalizedY));

    // Call movement callback
    this.onMove({
      x: clampedX,
      y: clampedY,
      rawX: normalizedX,
      rawY: normalizedY,
      magnitude: clampedDistance / this.config.maxRadius,
      angle: angle,
      distance: distance,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      isActive: this.active,
      isMouse: this.useMouse
    });

    // Debug output
    if (this.debugMode) {
      this.frameCount++;
      if (now - this.lastFrameTime >= 1000) {
        console.log(`[Joystick] FPS: ${this.frameCount}`);
        this.frameCount = 0;
        this.lastFrameTime = now;
      }
    }
  }

  updateBasePosition() {
    // Position base at center point with null safety
    if (this.base) {
      this.base.style.left = `${this.centerX}px`;
      this.base.style.top = `${this.centerY}px`;
    }
  }

  reset() {
    this.log('[Joystick] Reset');

    this.active = false;
    this.touchId = null;
    this.useMouse = false;

    this.currentX = 0;
    this.currentY = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.moveHistory = [];

    // Reset stick position with null safety
    if (this.stick) {
      this.stick.style.transform = 'translate(-50%, -50%)';
    }

    // Remove visual feedback
    if (this.base) this.base.classList.remove('active');
    if (this.zone) this.zone.classList.remove('active');

    // Trigger end callback
    this.onEnd({
      x: this.currentX,
      y: this.currentY,
      isMouse: this.useMouse
    });
  }

  // Public API methods

  getPosition() {
    return {
      x: this.currentX,
      y: this.currentY
    };
  }

  getNormalizedPosition() {
    return {
      x: this.currentX / this.config.maxRadius,
      y: this.currentY / this.config.maxRadius
    };
  }

  getDirection() {
    const magnitude = Math.sqrt(this.currentX * this.currentX + this.currentY * this.currentY);

    if (magnitude === 0) {
      return { x: 0, y: 0, angle: 0, cardinal: 'center' };
    }

    const x = this.currentX / magnitude;
    const y = this.currentY / magnitude;

    // Determine cardinal direction
    let cardinal = 'center';
    const threshold = 0.5;

    if (magnitude > threshold) {
      if (Math.abs(x) > Math.abs(y)) {
        cardinal = x > 0 ? 'right' : 'left';
      } else {
        cardinal = y > 0 ? 'down' : 'up';
      }
    }

    return {
      x: x,
      y: y,
      angle: Math.atan2(y, x),
      magnitude: magnitude,
      cardinal: cardinal
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

  getVelocity() {
    return {
      x: this.velocityX,
      y: this.velocityY,
      magnitude: Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY)
    };
  }

  isActive() {
    return this.active;
  }

  isEnabled() {
    return this.enabled;
  }

  isInitialized() {
    return this.initialized;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  isVisible() {
    return this.visible;
  }

  setVisible(visible) {
    this.visible = visible;
    if (this.zone) {
      this.zone.style.display = visible ? 'block' : 'none';
    }
  }

  setMaxRadius(radius) {
    this.config.maxRadius = Math.max(1, radius);
  }

  setSensitivity(sensitivity) {
    this.config.sensitivity = Math.max(0.1, Math.min(5, sensitivity));
  }

  setDeadZone(deadZone) {
    this.config.deadZone = Math.max(0, deadZone);
  }

  setCenter(x, y) {
    this.centerX = x;
    this.centerY = y;
    this.updateBasePosition();
  }

  recenter() {
    if (this.zone) {
      this.centerX = this.zone.offsetLeft + this.zone.offsetWidth / 2;
      this.centerY = this.zone.offsetTop + this.zone.offsetHeight / 2;
      this.updateBasePosition();
    }
  }

  setDebugMode(enabled) {
    this.debugMode = enabled;
    if (enabled) {
      console.log('[Joystick] Debug mode enabled');
    }
  }

  getDebugInfo() {
    return {
      active: this.active,
      enabled: this.enabled,
      initialized: this.initialized,
      visible: this.visible,
      position: this.getPosition(),
      direction: this.getDirection(),
      velocity: this.getVelocity(),
      config: this.config
    };
  }

  // Utility methods

  log(...args) {
    if (this.debugMode || this.config.debug) {
      console.log(...args);
    }
  }

  destroy() {
    this.log('[Joystick] Destroying...');

    // Remove event listeners
    if (this.zone) {
      this.zone.removeEventListener('touchstart', this._boundTouchStart);
      this.zone.removeEventListener('touchmove', this._boundTouchMove);
      this.zone.removeEventListener('touchend', this._boundTouchEnd);
      this.zone.removeEventListener('touchcancel', this._boundTouchCancel);

      if (this.config.enableMouse !== false) {
        this.zone.removeEventListener('mousedown', this._boundMouseDown);
      }

      if (this.config.enableHover !== false) {
        this.zone.removeEventListener('mouseenter', this.onZoneEnter);
        this.zone.removeEventListener('mouseleave', this.onZoneLeave);
      }
    }

    // Remove document-level listeners
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);

    // Remove dynamically created elements
    if (this.zone && this.zone.parentNode) {
      this.zone.parentNode.removeChild(this.zone);
    }

    // Reset state
    this.reset();
    this.enabled = false;
    this.initialized = false;

    // Clear callbacks
    this.onMove = () => {};
    this.onStart = () => {};
    this.onEnd = () => {};
    this.onZoneEnter = () => {};
    this.onZoneLeave = () => {};

    // Clear element references
    this.zone = null;
    this.base = null;
    this.stick = null;

    console.log('[Joystick] Destroyed');
  }

  // Compatibility method for game.js cleanup
  cleanup() {
    this.destroy();
  }
}

// Export for use in game.js
window.VirtualJoystick = VirtualJoystick;
