/**
 * Cosmic Deception - Virtual Joystick Module
 * Touch-friendly on-screen controls for mobile devices
 */

// ========================================
// Joystick Configuration
// ========================================
// These constants define joystick settings
const JOYSTICK_CONFIG = {
    // Visual settings
    VISUAL: {
        baseSize: 160,       // Diameter of joystick base in pixels
        stickSize: 60,       // Diameter of joystick stick in pixels
        baseColor: 'rgba(255, 255, 255, 0.1)',
        baseBorderColor: 'rgba(255, 255, 255, 0.2)',
        stickColor: 'rgba(255, 255, 255, 0.3)',
        stickBorderColor: 'rgba(255, 255, 255, 0.4)',
        deadZone: 10         // Minimum distance before input is registered
    },
    
    // Input settings
    INPUT: {
        maxDistance: 80,     // Maximum stick movement distance
        angleSnap: 15,       // Snap to cardinal directions within this angle (degrees)
        inputInterval: 50    // Send input updates at this interval (ms)
    },
    
    // Touch settings
    TOUCH: {
        longPressDuration: 500,  // Duration to consider as long press
        multiTouchThreshold: 2   // Number of touches to consider as multi-touch
    }
};

// ========================================
// Joystick State
// ========================================
const joystick = {
    // Element references
    container: null,
    base: null,
    stick: null,
    
    // Touch state
    active: false,
    touchId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    
    // Input state
    input: {
        x: 0,           // -1 to 1 (left/right)
        y: 0,           // -1 to 1 (up/down)
        angle: 0,       // Angle in radians
        active: false   // Whether joystick is being used
    },
    
    // Timing
    lastInputTime: 0,
    inputInterval: null,
    
    // State tracking
    enabled: false,
    visible: false
};

// ========================================
// Initialization
// ========================================
function initJoystick() {
    console.log('[Joystick] Initializing virtual joystick...');
    
    // Get or create joystick elements
    createJoystickElements();
    
    // Set up touch event handlers
    setupTouchHandlers();
    
    // Set up keyboard fallback for testing
    setupKeyboardFallback();
    
    console.log('[Joystick] Joystick initialized');
}

/**
 * Create joystick DOM elements
 */
function createJoystickElements() {
    // Check if joystick already exists
    joystick.container = document.getElementById('joystick-container');
    
    if (!joystick.container) {
        // Create container
        joystick.container = document.createElement('div');
        joystick.container.id = 'joystick-container';
        joystick.container.className = 'joystick-container';
        
        // Create base
        joystick.base = document.createElement('div');
        joystick.base.className = 'joystick-base';
        
        // Create stick
        joystick.stick = document.createElement('div');
        joystick.stick.className = 'joystick-stick';
        
        // Assemble
        joystick.base.appendChild(joystick.stick);
        joystick.container.appendChild(joystick.base);
        
        // Add to document
        const mobileControls = document.getElementById('mobile-controls');
        if (mobileControls) {
            mobileControls.appendChild(joystick.container);
        } else {
            document.body.appendChild(joystick.container);
        }
    } else {
        // Get existing elements
        joystick.base = joystick.container.querySelector('.joystick-base');
        joystick.stick = joystick.container.querySelector('.joystick-stick');
    }
    
    // Apply visual configuration
    applyVisualConfig();
    
    // Set initial position
    resetJoystick();
}

/**
 * Apply visual configuration to joystick elements
 */
function applyVisualConfig() {
    if (!joystick.base || !joystick.stick) return;
    
    // Set base dimensions
    joystick.base.style.width = `${JOYSTICK_CONFIG.VISUAL.baseSize}px`;
    joystick.base.style.height = `${JOYSTICK_CONFIG.VISUAL.baseSize}px`;
    
    // Set stick dimensions
    joystick.stick.style.width = `${JOYSTICK_CONFIG.VISUAL.stickSize}px`;
    joystick.stick.style.height = `${JOYSTICK_CONFIG.VISUAL.stickSize}px`;
    
    // Set colors
    joystick.base.style.backgroundColor = JOYSTICK_CONFIG.VISUAL.baseColor;
    joystick.base.style.borderColor = JOYSTICK_CONFIG.VISUAL.baseBorderColor;
    joystick.stick.style.backgroundColor = JOYSTICK_CONFIG.VISUAL.stickColor;
    joystick.stick.style.borderColor = JOYSTICK_CONFIG.VISUAL.stickBorderColor;
}

/**
 * Reset joystick to center position
 */
function resetJoystick() {
    if (!joystick.stick) return;
    
    joystick.stick.style.transform = 'translate(-50%, -50%)';
    
    joystick.input.x = 0;
    joystick.input.y = 0;
    joystick.input.angle = 0;
    joystick.input.active = false;
}

/**
 * Show joystick on screen
 */
function showJoystick() {
    if (!joystick.container) return;
    
    joystick.container.style.display = 'flex';
    joystick.visible = true;
}

/**
 * Hide joystick from screen
 */
function hideJoystick() {
    if (!joystick.container) return;
    
    joystick.container.style.display = 'none';
    joystick.visible = false;
    resetJoystick();
}

/**
 * Enable joystick input
 */
function enableJoystick() {
    joystick.enabled = true;
    showJoystick();
    console.log('[Joystick] Joystick enabled');
}

/**
 * Disable joystick input
 */
function disableJoystick() {
    joystick.enabled = false;
    hideJoystick();
    console.log('[Joystick] Joystick disabled');
}

// ========================================
// Touch Event Handlers
// ========================================
function setupTouchHandlers() {
    if (!joystick.container) return;
    
    // Touch start
    joystick.container.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // Touch move
    joystick.container.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    // Touch end
    joystick.container.addEventListener('touchend', handleTouchEnd);
    joystick.container.addEventListener('touchcancel', handleTouchEnd);
    
    // Prevent default touch behaviors
    joystick.container.addEventListener('contextmenu', (e) => e.preventDefault());
}

/**
 * Handle touch start event
 */
function handleTouchStart(e) {
    e.preventDefault();
    
    if (!joystick.enabled || joystick.active) return;
    
    const touch = e.changedTouches[0];
    if (!touch) return;
    
    // Store touch ID for multi-touch tracking
    joystick.touchId = touch.identifier;
    joystick.active = true;
    
    // Get base position
    const rect = joystick.base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Store start position
    joystick.startX = centerX;
    joystick.startY = centerY;
    
    // Immediately move stick to touch position
    updateJoystickPosition(touch.clientX, touch.clientY);
    
    // Start input sending
    startInputSending();
    
    // Emit event
    emitJoystickEvent('start', { x: joystick.input.x, y: joystick.input.y });
}

/**
 * Handle touch move event
 */
function handleTouchMove(e) {
    e.preventDefault();
    
    if (!joystick.active) return;
    
    // Find our touch
    let touch = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystick.touchId) {
            touch = e.changedTouches[i];
            break;
        }
    }
    
    if (!touch) return;
    
    // Update joystick position
    updateJoystickPosition(touch.clientX, touch.clientY);
}

/**
 * Handle touch end event
 */
function handleTouchEnd(e) {
    e.preventDefault();
    
    // Check if our touch ended
    let found = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystick.touchId) {
            found = true;
            break;
        }
    }
    
    if (!found) return;
    
    // Reset joystick
    joystick.active = false;
    joystick.touchId = null;
    resetJoystick();
    
    // Stop input sending
    stopInputSending();
    
    // Emit event
    emitJoystickEvent('end', {});
}

/**
 * Update joystick visual position and input values
 */
function updateJoystickPosition(clientX, clientY) {
    if (!joystick.base || !joystick.stick) return;
    
    const rect = joystick.base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate distance from center
    let deltaX = clientX - centerX;
    let deltaY = clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Clamp to max distance
    const maxDist = JOYSTICK_CONFIG.INPUT.maxDistance;
    
    if (distance > maxDist) {
        deltaX = (deltaX / distance) * maxDist;
        deltaY = (deltaY / distance) * maxDist;
    }
    
    // Apply dead zone
    if (distance < JOYSTICK_CONFIG.VISUAL.deadZone) {
        deltaX = 0;
        deltaY = 0;
    }
    
    // Update visual position
    joystick.stick.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
    
    // Calculate normalized input values (-1 to 1)
    const normalizedDistance = distance > 0 ? Math.min(distance, maxDist) / maxDist : 0;
    
    // Calculate angle
    let angle = Math.atan2(deltaY, deltaX);
    
    // Apply angle snapping
    if (JOYSTICK_CONFIG.INPUT.angleSnap > 0) {
        const snapAngle = (JOYSTICK_CONFIG.INPUT.angleSnap * Math.PI) / 180;
        const snappedAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        
        for (const snap of snappedAngles) {
            let angleDiff = Math.abs(angle - snap);
            if (angleDiff > Math.PI) {
                angleDiff = 2 * Math.PI - angleDiff;
            }
            
            if (angleDiff < snapAngle) {
                angle = snap;
                break;
            }
        }
    }
    
    // Update input state
    joystick.input.x = Math.cos(angle) * normalizedDistance;
    joystick.input.y = Math.sin(angle) * normalizedDistance;
    joystick.input.angle = angle;
    joystick.input.active = normalizedDistance > 0;
}

// ========================================
// Input Sending
// ========================================
function startInputSending() {
    if (joystick.inputInterval) return;
    
    joystick.inputInterval = setInterval(() => {
        if (!joystick.active) return;
        
        const now = Date.now();
        if (now - joystick.lastInputTime < JOYSTICK_CONFIG.INPUT.inputInterval) {
            return;
        }
        
        joystick.lastInputTime = now;
        sendJoystickInput();
    }, JOYSTICK_CONFIG.INPUT.inputInterval);
}

function stopInputSending() {
    if (joystick.inputInterval) {
        clearInterval(joystick.inputInterval);
        joystick.inputInterval = null;
    }
    
    // Send final input (zero)
    sendJoystickInput();
}

/**
 * Send joystick input to game
 */
function sendJoystickInput() {
    // Update game inputs based on joystick position
    if (game && game.inputs) {
        const threshold = 0.1;
        
        game.inputs.thrust = joystick.input.y < -threshold;
        game.inputs.brake = joystick.input.y > threshold;
        game.inputs.rotateLeft = joystick.input.x < -threshold;
        game.inputs.rotateRight = joystick.input.x > threshold;
    }
    
    // Emit event for external listeners
    emitJoystickEvent('input', {
        x: joystick.input.x,
        y: joystick.input.y,
        angle: joystick.input.angle,
        active: joystick.input.active
    });
}

// ========================================
// Keyboard Fallback (for testing on desktop)
// ========================================
function setupKeyboardFallback() {
    const keys = {
        w: false,
        a: false,
        s: false,
        d: false,
        ArrowUp: false,
        ArrowLeft: false,
        ArrowDown: false,
        ArrowRight: false
    };
    
    document.addEventListener('keydown', (e) => {
        if (e.code in keys || e.key.toLowerCase() in keys) {
            keys[e.code] = true;
            keys[e.key.toLowerCase()] = true;
            updateFromKeyboard(keys);
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.code in keys || e.key.toLowerCase() in keys) {
            keys[e.code] = false;
            keys[e.key.toLowerCase()] = false;
            updateFromKeyboard(keys);
        }
    });
    
    function updateFromKeyboard(keyState) {
        if (!joystick.enabled) return;
        
        const up = keyState.w || keyState.ArrowUp;
        const down = keyState.s || keyState.ArrowDown;
        const left = keyState.a || keyState.ArrowLeft;
        const right = keyState.d || keyState.ArrowRight;
        
        if (up || down || left || right) {
            // Calculate input from keyboard
            let x = 0;
            let y = 0;
            
            if (left) x -= 1;
            if (right) x += 1;
            if (up) y -= 1;
            if (down) y += 1;
            
            // Normalize
            const magnitude = Math.sqrt(x * x + y * y);
            if (magnitude > 0) {
                x /= magnitude;
                y /= magnitude;
            }
            
            // Update visual
            const maxDist = JOYSTICK_CONFIG.INPUT.maxDistance;
            const visualX = x * maxDist;
            const visualY = y * maxDist;
            
            if (joystick.stick) {
                joystick.stick.style.transform = `translate(calc(-50% + ${visualX}px), calc(-50% + ${visualY}px))`;
            }
            
            // Update input state
            joystick.input.x = x;
            joystick.input.y = y;
            joystick.input.angle = Math.atan2(y, x);
            joystick.input.active = true;
            
            // Send input
            sendJoystickInput();
        } else if (!joystick.active) {
            // Reset if not being used
            resetJoystick();
            sendJoystickInput();
        }
    }
}

// ========================================
// Event System
// ========================================
function emitJoystickEvent(type, data) {
    // Emit to game
    if (typeof onJoystickInput === 'function') {
        onJoystickInput(data);
    }
    
    // Create custom event
    const event = new CustomEvent('joystick' + type.charAt(0).toUpperCase() + type.slice(1), {
        detail: data,
        bubbles: true
    });
    document.dispatchEvent(event);
}

/**
 * Set callback for joystick input
 */
function setJoystickCallback(callback) {
    window.onJoystickInput = callback;
}

// ========================================
// Utility Functions
// ========================================

/**
 * Get current input values
 */
function getJoystickInput() {
    return {
        x: joystick.input.x,
        y: joystick.input.y,
        angle: joystick.input.angle,
        active: joystick.input.active
    };
}

/**
 * Check if joystick is active (being touched)
 */
function isJoystickActive() {
    return joystick.active;
}

/**
 * Get joystick configuration
 */
function getJoystickConfig() {
    return { ...JOYSTICK_CONFIG };
}

/**
 * Calibrate joystick center position
 */
function calibrateJoystick() {
    if (!joystick.base) return;
    
    const rect = joystick.base.getBoundingClientRect();
    joystick.startX = rect.left + rect.width / 2;
    joystick.startY = rect.top + rect.height / 2;
    
    console.log('[Joystick] Calibrated at position:', joystick.startX, joystick.startY);
}

// ========================================
// Cleanup
// ========================================
function destroyJoystick() {
    stopInputSending();
    
    if (joystick.container && joystick.container.parentNode) {
        joystick.container.parentNode.removeChild(joystick.container);
    }
    
    joystick.container = null;
    joystick.base = null;
    joystick.stick = null;
    
    console.log('[Joystick] Joystick destroyed');
}

/**
 * Clean up on page unload
 */
window.addEventListener('beforeunload', () => {
    destroyJoystick();
});

// ========================================
// Auto-initialization
// ========================================
// Auto-enable on touch devices
function checkTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// Initialize and auto-enable on touch devices
document.addEventListener('DOMContentLoaded', () => {
    initJoystick();
    
    if (checkTouchDevice()) {
        enableJoystick();
    }
});

// ========================================
// Export for module usage
// ========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        joystick, 
        initJoystick, 
        enableJoystick, 
        disableJoystick,
        getJoystickInput,
        setJoystickCallback,
        JOYSTICK_CONFIG 
    };
}
