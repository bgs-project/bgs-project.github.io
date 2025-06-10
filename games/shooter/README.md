# Multiplayer 2D Shooter Game 🎯

A real-time multiplayer 2D shooter game built with Socket.io, Express, and HTML5 Canvas.

## Features
- Real-time multiplayer gameplay
- Smooth player movement with WASD or arrow keys
- Mouse aiming and shooting
- Health system with visual health bars
- Score tracking
- Automatic respawning
- Collision detection
- Multiple player support with different colors

## Installation

1. Make sure you have Node.js installed on your system
2. Navigate to the project directory
3. Install dependencies:
   ```bash
   npm install
   ```

## Running the Game

1. Start the server:
   ```bash
   npm start
   ```
   or
   ```bash
   node server.js
   ```

2. Open your web browser and go to:
   ```
   http://localhost:3000
   ```

3. Share the URL with friends to play together!

## How to Play

- **Movement**: Use WASD or Arrow Keys to move around
- **Aiming**: Move your mouse to aim your weapon
- **Shooting**: Click to fire bullets
- **Goal**: Shoot other players to score points
- **Health**: You have 100 HP, each hit deals 20 damage
- **Respawn**: When you die, you'll automatically respawn at a random location

## Game Mechanics

- Players are represented as colored squares with gun barrels
- Your player has a white outline to distinguish it from others
- Health bars appear above players when they take damage
- Each successful hit gives you 10 points
- Bullets have limited range and will disappear after traveling a certain distance
- Players spawn at random locations when joining or respawning

## Technical Details

- **Backend**: Node.js with Express and Socket.io
- **Frontend**: HTML5 Canvas with vanilla JavaScript
- **Real-time Communication**: WebSocket connections via Socket.io
- **Game Loop**: 60 FPS server-side updates
- **Collision Detection**: Circle-to-rectangle collision detection

## File Structure

```
├── server.js          # Express server with Socket.io
├── shooter.html       # Main game HTML file
├── game.js           # Client-side game logic
├── package.json      # NPM dependencies
└── README.md         # This file
```

## Multiplayer Support

The game supports multiple players simultaneously. Each player gets:
- A unique color
- Individual health and score tracking
- Real-time position updates
- Synchronized bullet physics

## Development

To modify the game:

1. **Server Logic**: Edit `server.js` for game rules, collision detection, and multiplayer logic
2. **Client Logic**: Edit `game.js` for rendering, input handling, and client-side predictions
3. **Styling**: Edit the CSS in `shooter.html` for visual improvements

## Browser Compatibility

The game works in all modern browsers that support:
- HTML5 Canvas
- WebSocket connections
- ES6 JavaScript features

Enjoy the game! 🎮

