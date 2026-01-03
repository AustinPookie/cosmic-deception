# Cosmic Deception

A multiplayer deception game inspired by Among Us, built with Node.js, Socket.IO, and vanilla JavaScript.

## Features

- Real-time multiplayer gameplay
- Voice chat using WebRTC
- Mobile-friendly virtual joystick controls
- Role-based gameplay (Crewmates vs Imposters)
- Task system for crewmates
- Emergency meetings and voting
- Multiple maps (starting with "The Skeld")

## Security Improvements

This version includes:
- Content Security Policy (CSP) headers
- XSS protection with input sanitization
- Rate limiting on socket events
- Player name validation
- Color validation for HTML injection prevention

## Installation

```bash
# Install dependencies
npm install

# Start the server
npm start
