const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(__dirname));

// Serve the game page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'shooter.html'));
});

// Serve the map editor
app.get('/editor', (req, res) => {
    res.sendFile(path.join(__dirname, 'map-editor.html'));
});

// API to get available maps
app.get('/api/maps', (req, res) => {
    try {
        const mapsDir = path.join(__dirname, 'maps');
        const files = fs.readdirSync(mapsDir).filter(file => file.endsWith('.json'));
        const maps = files.map(file => {
            const mapData = JSON.parse(fs.readFileSync(path.join(mapsDir, file), 'utf8'));
            return {
                filename: file,
                name: mapData.name,
                size: `${mapData.width}x${mapData.height}`
            };
        });
        res.json(maps);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load maps' });
    }
});

// API to get specific map
app.get('/api/maps/:filename', (req, res) => {
    try {
        const mapPath = path.join(__dirname, 'maps', req.params.filename);
        if (!fs.existsSync(mapPath)) {
            return res.status(404).json({ error: 'Map not found' });
        }
        const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        res.json(mapData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load map' });
    }
});

// Game state
const rooms = new Map();
const players = new Map();

class Room {
    constructor(name, mapName = 'default') {
        this.name = name;
        this.players = new Map();
        this.bullets = [];
        this.createdAt = new Date();
        this.mapData = this.loadMap(mapName);
        this.powerups = new Map(); // Track powerup states
        this.initializePowerups();
    }
    
    loadMap(mapName) {
        try {
            const mapPath = path.join(__dirname, 'maps', `${mapName}.json`);
            if (fs.existsSync(mapPath)) {
                return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
            }
        } catch (error) {
            console.error(`Failed to load map ${mapName}:`, error);
        }
        
        // Return default empty map if loading fails
        return {
            name: 'default',
            width: 800,
            height: 600,
            walls: [],
            spawns: [],
            powerups: [],
            hazards: []
        };
    }
    
    initializePowerups() {
        if (this.mapData.powerups) {
            this.mapData.powerups.forEach(powerup => {
                this.powerups.set(powerup.id, {
                    ...powerup,
                    active: true,
                    lastPickupTime: 0
                });
            });
        }
    }
    
    addPlayer(player) {
        this.players.set(player.id, player);
    }
    
    removePlayer(playerId) {
        this.players.delete(playerId);
        // Remove bullets owned by this player
        this.bullets = this.bullets.filter(bullet => bullet.ownerId !== playerId);
    }
    
    isEmpty() {
        return this.players.size === 0;
    }
    
    getPlayerCount() {
        return this.players.size;
    }
}

// Game settings
const BULLET_SPEED = 8;
const BULLET_DAMAGE = 20;
const PLAYER_SPEED = 5;
const MAX_HEALTH = 100;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Player colors
const PLAYER_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#795548'];

function getRandomSpawnPosition(room) {
    // Use map spawn points if available
    if (room && room.mapData && room.mapData.spawns && room.mapData.spawns.length > 0) {
        const spawn = room.mapData.spawns[Math.floor(Math.random() * room.mapData.spawns.length)];
        return { x: spawn.x, y: spawn.y };
    }
    
    // Default random spawn
    return {
        x: Math.random() * (CANVAS_WIDTH - 40) + 20,
        y: Math.random() * (CANVAS_HEIGHT - 40) + 20
    };
}

function checkWallCollision(x, y, room) {
    if (!room || !room.mapData || !room.mapData.walls) return false;
    
    for (let wall of room.mapData.walls) {
        // Only walls, pillars, and barriers block player movement
        // Cover is walkable through
        if (wall.type === 'wall' || wall.type === 'pillar' || wall.type === 'barrier') {
            if (x >= wall.x - wall.width/2 && x <= wall.x + wall.width/2 &&
                y >= wall.y - wall.height/2 && y <= wall.y + wall.height/2) {
                return true;
            }
        }
    }
    return false;
}

function checkHazardCollision(x, y, room) {
    if (!room || !room.mapData || !room.mapData.hazards) return null;
    
    for (let hazard of room.mapData.hazards) {
        if (x >= hazard.x - hazard.width/2 && x <= hazard.x + hazard.width/2 &&
            y >= hazard.y - hazard.height/2 && y <= hazard.y + hazard.height/2) {
            return hazard;
        }
    }
    return null;
}

function checkBulletWallCollision(bullet, room) {
    if (!room || !room.mapData || !room.mapData.walls) return false;
    
    for (let wall of room.mapData.walls) {
        // Walls, pillars, and cover block bullets
        // Barriers let bullets pass through
        if (wall.type === 'wall' || wall.type === 'pillar' || wall.type === 'cover') {
            if (bullet.x >= wall.x - wall.width/2 && bullet.x <= wall.x + wall.width/2 &&
                bullet.y >= wall.y - wall.height/2 && bullet.y <= wall.y + wall.height/2) {
                return wall;
            }
        }
    }
    return false;
}

function updateBulletsInRoom(room) {
    for (let i = room.bullets.length - 1; i >= 0; i--) {
        const bullet = room.bullets[i];
        
        // Update position
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        bullet.life--;
        
        // Check wall collision
        const hitWall = checkBulletWallCollision(bullet, room);
        if (hitWall) {
            // If it's destructible cover, reduce its health
            if (hitWall.type === 'cover' && hitWall.properties.destructible) {
                hitWall.properties.health = (hitWall.properties.health || 100) - BULLET_DAMAGE;
                
                // If cover is destroyed, remove it from the map
                if (hitWall.properties.health <= 0) {
                    room.mapData.walls = room.mapData.walls.filter(wall => wall.id !== hitWall.id);
                    
                    // Notify clients about destroyed cover
                    io.to(room.name).emit('coverDestroyed', {
                        wallId: hitWall.id
                    });
                }
            }
            
            room.bullets.splice(i, 1);
            continue;
        }
        
        // Remove bullets that are off-screen or expired
        if (bullet.x < 0 || bullet.x > (room.mapData.width || CANVAS_WIDTH) || 
            bullet.y < 0 || bullet.y > (room.mapData.height || CANVAS_HEIGHT) || 
            bullet.life <= 0) {
            room.bullets.splice(i, 1);
            continue;
        }
        
        // Check collision with players in this room
        room.players.forEach((player, playerId) => {
            if (playerId !== bullet.ownerId) {
                const dx = bullet.x - player.x;
                const dy = bullet.y - player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < bullet.size + player.width / 2) {
                    // Hit!
                    player.health -= BULLET_DAMAGE;
                    room.bullets.splice(i, 1);
                    
                    // Update shooter's score
                    if (room.players.has(bullet.ownerId)) {
                        room.players.get(bullet.ownerId).score += 10;
                    }
                    
                    // Check if player died
                    let respawned = false;
                    if (player.health <= 0) {
                        const spawnPos = getRandomSpawnPosition(room);
                        player.x = spawnPos.x;
                        player.y = spawnPos.y;
                        player.health = MAX_HEALTH;
                        respawned = true;
                    }
                    
                    // Notify clients in this room
                    io.to(room.name).emit('playerHit', {
                        playerId: playerId,
                        health: player.health,
                        shooterId: bullet.ownerId,
                        respawned: respawned,
                        newPosition: respawned ? { x: player.x, y: player.y } : null
                    });
                    
                    return;
                }
            }
        });
    }
}

function getRoomsList() {
    const roomsList = [];
    rooms.forEach((room, name) => {
        roomsList.push({
            name: name,
            playerCount: room.getPlayerCount(),
            maxPlayers: 8 // You can adjust this
        });
    });
    return roomsList;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Send current rooms list
    socket.emit('roomsList', getRoomsList());
    
    // Handle room creation
    socket.on('createRoom', (data) => {
        const { roomName, playerName, mapName } = data;
        
        if (!roomName || !playerName) {
            socket.emit('error', 'Room name and player name are required');
            return;
        }
        
        if (rooms.has(roomName)) {
            socket.emit('error', 'Room already exists');
            return;
        }
        
        // Create new room with specified map
        const room = new Room(roomName, mapName || 'default');
        rooms.set(roomName, room);
        
        // Join the room
        joinRoom(socket, roomName, playerName);
        
        // Broadcast updated rooms list
        io.emit('roomsList', getRoomsList());
    });
    
    // Handle joining existing room
    socket.on('joinRoom', (data) => {
        const { roomName, playerName } = data;
        joinRoom(socket, roomName, playerName);
    });
    
    function joinRoom(socket, roomName, playerName) {
        if (!rooms.has(roomName)) {
            socket.emit('error', 'Room does not exist');
            return;
        }
        
        const room = rooms.get(roomName);
        
        if (room.getPlayerCount() >= 8) {
            socket.emit('error', 'Room is full');
            return;
        }
        
        // Create player
        const spawnPos = getRandomSpawnPosition(room);
        const player = {
            id: socket.id,
            name: playerName,
            x: spawnPos.x,
            y: spawnPos.y,
            width: 20,
            height: 20,
            health: MAX_HEALTH,
            maxHealth: MAX_HEALTH,
            score: 0,
            angle: 0,
            color: PLAYER_COLORS[room.getPlayerCount() % PLAYER_COLORS.length],
            room: roomName,
            lastHazardDamage: 0
        };
        
        // Add player to room and global players map
        room.addPlayer(player);
        players.set(socket.id, player);
        
        // Join socket room
        socket.join(roomName);
        
        // Send game init to new player
        socket.emit('gameInit', {
            playerId: socket.id,
            roomName: roomName,
            players: Object.fromEntries(room.players),
            bullets: room.bullets,
            mapData: room.mapData
        });
        
        // Notify other players in the room
        socket.to(roomName).emit('playerJoined', player);
        
        // Update rooms list for all clients
        io.emit('roomsList', getRoomsList());
        
        console.log(`Player ${playerName} joined room ${roomName}`);
    }
    
    // Handle player movement
    socket.on('playerMove', (data) => {
        if (players.has(socket.id)) {
            const player = players.get(socket.id);
            const room = rooms.get(player.room);
            
            // Check wall collisions
            const newX = Math.max(10, Math.min((room.mapData.width || CANVAS_WIDTH) - 10, data.x));
            const newY = Math.max(10, Math.min((room.mapData.height || CANVAS_HEIGHT) - 10, data.y));
            
            if (!checkWallCollision(newX, newY, room)) {
                player.x = newX;
                player.y = newY;
                
                // Check for hazard damage
                const hazard = checkHazardCollision(newX, newY, room);
                if (hazard) {
                    const currentTime = Date.now();
                    const lastHazardDamage = player.lastHazardDamage || 0;
                    const damageInterval = (hazard.properties.damageInterval || 1) * 1000; // Convert to milliseconds
                    
                    if (currentTime - lastHazardDamage >= damageInterval) {
                        const damage = hazard.properties.damage || 10;
                        player.health -= damage;
                        player.lastHazardDamage = currentTime;
                        
                        // Check if player died from hazard
                        let respawned = false;
                        if (player.health <= 0) {
                            const spawnPos = getRandomSpawnPosition(room);
                            player.x = spawnPos.x;
                            player.y = spawnPos.y;
                            player.health = MAX_HEALTH;
                            respawned = true;
                        }
                        
                        // Notify about hazard damage
                        io.to(room.name).emit('playerHit', {
                            playerId: socket.id,
                            health: player.health,
                            shooterId: null, // No shooter for hazard damage
                            respawned: respawned,
                            newPosition: respawned ? { x: player.x, y: player.y } : null,
                            damageType: 'hazard',
                            hazardType: hazard.type
                        });
                    }
                }
            
            player.angle = data.angle;
            
                // Broadcast to other players in the same room (only if position actually changed)
                socket.to(player.room).emit('playerMoved', {
                    playerId: socket.id,
                    x: player.x,
                    y: player.y,
                    angle: player.angle
                });
            } else {
                // If collision detected, send correction back to client
                socket.emit('positionCorrection', {
                    x: player.x,
                    y: player.y
                });
            }
        }
    });
    
    // Handle shooting
    socket.on('shoot', (data) => {
        if (players.has(socket.id)) {
            const player = players.get(socket.id);
            const room = rooms.get(player.room);
            
            if (room) {
                const bullet = {
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(data.angle) * BULLET_SPEED,
                    vy: Math.sin(data.angle) * BULLET_SPEED,
                    size: 4,
                    ownerId: socket.id,
                    life: 100
                };
                
                room.bullets.push(bullet);
                
                // Broadcast bullet to players in the same room
                io.to(player.room).emit('bulletFired', bullet);
            }
        }
    });
    
    // Handle leaving room
    socket.on('leaveRoom', () => {
        if (players.has(socket.id)) {
            const player = players.get(socket.id);
            const room = rooms.get(player.room);
            
            if (room) {
                room.removePlayer(socket.id);
                socket.leave(player.room);
                
                // Notify other players in the room
                socket.to(player.room).emit('playerLeft', socket.id);
                
                // Remove empty rooms
                if (room.isEmpty()) {
                    rooms.delete(player.room);
                }
                
                // Update rooms list
                io.emit('roomsList', getRoomsList());
            }
            
            players.delete(socket.id);
        }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (players.has(socket.id)) {
            const player = players.get(socket.id);
            const room = rooms.get(player.room);
            
            if (room) {
                room.removePlayer(socket.id);
                
                // Notify other players in the room
                socket.to(player.room).emit('playerLeft', socket.id);
                
                // Remove empty rooms
                if (room.isEmpty()) {
                    rooms.delete(player.room);
                }
                
                // Update rooms list
                io.emit('roomsList', getRoomsList());
            }
            
            players.delete(socket.id);
        }
    });
});

// Game loop for server-side updates
setInterval(() => {
    // Update each room separately
    rooms.forEach((room, roomName) => {
        updateBulletsInRoom(room);
        
        // Send updated game state to clients in this room
        io.to(roomName).emit('gameUpdate', {
            players: Object.fromEntries(room.players),
            bullets: room.bullets,
            powerups: Array.from(room.powerups.values())
        });
    });
}, 1000 / 60); // 60 FPS

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎯 Multiplayer Shooter Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});

