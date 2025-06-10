// Multiplayer 2D Shooter Game
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.socket = null;
        
        // Game state
        this.players = new Map();
        this.bullets = [];
        this.myPlayerId = null;
        this.currentRoom = null;
        this.inGame = false;
        this.mapData = null;
        
        // Player properties
        this.player = {
            x: 400,
            y: 300,
            width: 20,
            height: 20,
            speed: 5,
            health: 100,
            maxHealth: 100,
            score: 0,
            angle: 0,
            color: '#4CAF50',
            lastDamageTime: 0,
            regenerating: false,
            name: 'Player'
        };
        
        // Input state
        this.keys = {};
        this.mouse = { x: 0, y: 0 };
        
        // Game settings
        this.bulletSpeed = 8;
        this.bulletSize = 4;
        this.playerColors = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0'];
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupLobbyEventListeners();
        this.loadAvailableMaps();
        this.connectToServer();
        this.gameLoop();
    }
    
    async loadAvailableMaps() {
        try {
            const response = await fetch('/api/maps');
            const maps = await response.json();
            
            const mapSelect = document.getElementById('mapSelect');
            mapSelect.innerHTML = '';
            
            maps.forEach(map => {
                const option = document.createElement('option');
                option.value = map.filename.replace('.json', '');
                option.textContent = `${map.name} (${map.size})`;
                mapSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load maps:', error);
        }
    }
    
    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
        
        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        
        this.canvas.addEventListener('click', (e) => {
            this.shoot();
        });
        
        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    setupLobbyEventListeners() {
        // Create room button
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            this.createRoom();
        });
        
        // Enter key in room name field
        document.getElementById('roomName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createRoom();
            }
        });
        
        // Enter key in player name field
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createRoom();
            }
        });
    }
    
    connectToServer() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            document.getElementById('connectionStatus').textContent = 'Connected to server';
            document.getElementById('connectionStatus').className = 'status-connected';
        });
        
        this.socket.on('disconnect', () => {
            document.getElementById('connectionStatus').textContent = 'Disconnected from server';
            document.getElementById('connectionStatus').className = 'status-disconnected';
            if (this.inGame) {
                showLobby();
                this.inGame = false;
            }
        });
        
        // Lobby events
        this.socket.on('roomsList', (rooms) => {
            this.updateRoomsList(rooms);
        });
        
        this.socket.on('error', (message) => {
            alert('Error: ' + message);
        });
        
        this.socket.on('gameInit', (data) => {
            this.myPlayerId = data.playerId;
            this.currentRoom = data.roomName;
            this.mapData = data.mapData;
            this.players.clear();
            
            // Update canvas size if map specifies different dimensions
            if (this.mapData && this.mapData.width && this.mapData.height) {
                this.canvas.width = this.mapData.width;
                this.canvas.height = this.mapData.height;
            }
            
            Object.entries(data.players).forEach(([id, player]) => {
                if (id !== this.myPlayerId) {
                    // Ensure other players have proper health values
                    player.maxHealth = player.maxHealth || 100;
                    this.players.set(id, player);
                } else {
                    // Update our player with server data
                    this.player.x = player.x;
                    this.player.y = player.y;
                    this.player.color = player.color;
                    this.player.health = player.health;
                    this.player.score = player.score;
                    this.player.name = player.name;
                }
            });
            
            this.bullets = data.bullets || [];
            this.updatePlayerCount();
            this.updateHealthDisplay();
            this.updateScoreDisplay();
            
            // Update room name display
            document.getElementById('currentRoom').textContent = `${this.currentRoom} (${this.mapData?.name || 'default'})`;
            
            // Switch to game screen
            showGame();
            this.inGame = true;
        });
        
        this.socket.on('playerJoined', (player) => {
            // Ensure new players have proper health values
            player.maxHealth = player.maxHealth || 100;
            this.players.set(player.id, player);
            this.updatePlayerCount();
        });
        
        this.socket.on('playerLeft', (playerId) => {
            this.players.delete(playerId);
            this.updatePlayerCount();
        });
        
        this.socket.on('playerMoved', (data) => {
            if (this.players.has(data.playerId)) {
                const player = this.players.get(data.playerId);
                player.x = data.x;
                player.y = data.y;
                player.angle = data.angle;
            }
        });
        
        this.socket.on('bulletFired', (bullet) => {
            this.bullets.push(bullet);
        });
        
        this.socket.on('playerHit', (data) => {
            if (data.playerId === this.myPlayerId) {
                const oldHealth = this.player.health;
                this.player.health = data.health;
                this.player.lastDamageTime = Date.now();
                this.player.regenerating = false;
                
                // Handle respawn (teleportation)
                if (data.respawned && data.newPosition) {
                    this.player.x = data.newPosition.x;
                    this.player.y = data.newPosition.y;
                    this.showRespawnEffect();
                } else {
                    // Show damage effect based on damage type
                    const damage = oldHealth - this.player.health;
                    if (data.damageType === 'hazard') {
                        this.showHazardDamageEffect(damage, data.hazardType);
                    } else {
                        this.showDamageEffect(damage);
                    }
                }
                
                this.updateHealthDisplay();
            } else if (this.players.has(data.playerId)) {
                const otherPlayer = this.players.get(data.playerId);
                const oldHealth = otherPlayer.health;
                otherPlayer.health = data.health;
                
                // Handle other player respawn
                if (data.respawned && data.newPosition) {
                    otherPlayer.x = data.newPosition.x;
                    otherPlayer.y = data.newPosition.y;
                    this.showOtherPlayerRespawnEffect(otherPlayer);
                } else if (oldHealth > data.health) {
                    // Show visual effect for other players taking damage
                    this.showOtherPlayerDamageEffect(otherPlayer, oldHealth - data.health);
                }
            }
            
            if (data.shooterId === this.myPlayerId) {
                this.player.score += 10;
                this.updateScoreDisplay();
            }
        });
        
        this.socket.on('gameUpdate', (data) => {
            // Update bullets from server
            this.bullets = data.bullets || [];
            
            // Update map data if walls were destroyed
            if (data.mapData) {
                this.mapData = data.mapData;
            }
            
            // Update other players
            Object.entries(data.players).forEach(([id, serverPlayer]) => {
                if (id !== this.myPlayerId && this.players.has(id)) {
                    const player = this.players.get(id);
                    const oldHealth = player.health;
                    player.health = serverPlayer.health;
                    player.score = serverPlayer.score;
                    player.maxHealth = serverPlayer.maxHealth || 100;
                    
                    // Check if other player respawned (health went from 0 to max)
                    if (oldHealth <= 0 && player.health === 100) {
                        this.showOtherPlayerRespawnEffect(player);
                    }
                    // Don't update position here as it's handled by playerMoved events
                }
            });
        });
        
        // Handle cover destruction
        this.socket.on('coverDestroyed', (data) => {
            if (this.mapData && this.mapData.walls) {
                this.mapData.walls = this.mapData.walls.filter(wall => wall.id !== data.wallId);
                this.showCoverDestroyedEffect(data.wallId);
            }
        });
        
        // Handle position correction from server (for collision conflicts)
        this.socket.on('positionCorrection', (data) => {
            this.player.x = data.x;
            this.player.y = data.y;
        });
    }
    
    // Lobby methods
    createRoom() {
        const roomName = document.getElementById('roomName').value.trim();
        const playerName = document.getElementById('playerName').value.trim();
        const mapName = document.getElementById('mapSelect').value;
        
        if (!roomName) {
            alert('Please enter a room name');
            return;
        }
        
        if (!playerName) {
            alert('Please enter your name');
            return;
        }
        
        if (this.socket && this.socket.connected) {
            this.socket.emit('createRoom', {
                roomName: roomName,
                playerName: playerName,
                mapName: mapName
            });
        } else {
            alert('Not connected to server');
        }
    }
    
    joinRoom(roomName) {
        const playerName = document.getElementById('playerName').value.trim();
        
        if (!playerName) {
            alert('Please enter your name');
            return;
        }
        
        if (this.socket && this.socket.connected) {
            this.socket.emit('joinRoom', {
                roomName: roomName,
                playerName: playerName
            });
        } else {
            alert('Not connected to server');
        }
    }
    
    updateRoomsList(rooms) {
        const roomsContainer = document.getElementById('rooms');
        
        if (rooms.length === 0) {
            roomsContainer.innerHTML = 'No rooms available';
            return;
        }
        
        roomsContainer.innerHTML = '';
        
        rooms.forEach(room => {
            const roomElement = document.createElement('div');
            roomElement.className = 'room-item';
            
            const roomInfo = document.createElement('div');
            roomInfo.innerHTML = `
                <strong>${room.name}</strong><br>
                <small>Players: ${room.playerCount}/${room.maxPlayers}</small>
            `;
            
            const joinButton = document.createElement('button');
            joinButton.textContent = 'Join';
            joinButton.disabled = room.playerCount >= room.maxPlayers;
            joinButton.onclick = () => this.joinRoom(room.name);
            
            roomElement.appendChild(roomInfo);
            roomElement.appendChild(joinButton);
            roomsContainer.appendChild(roomElement);
        });
    }
    
    updateInput() {
        // Only process input if we're in game
        if (!this.inGame) return;
        
        // Health regeneration
        this.updateHealthRegeneration();
        
        // Movement
        let dx = 0, dy = 0;
        
        if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) dx += 1;
        
        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }
        
        // Calculate new position
        const newX = this.player.x + dx * this.player.speed;
        const newY = this.player.y + dy * this.player.speed;
        
        // Keep within canvas bounds
        const boundedX = Math.max(this.player.width/2, Math.min(this.canvas.width - this.player.width/2, newX));
        const boundedY = Math.max(this.player.height/2, Math.min(this.canvas.height - this.player.height/2, newY));
        
        // Check for wall collisions on client side
        if (!this.checkWallCollision(boundedX, boundedY)) {
            this.player.x = boundedX;
            this.player.y = boundedY;
        }
        
        // Calculate aim angle
        this.player.angle = Math.atan2(this.mouse.y - this.player.y, this.mouse.x - this.player.x);
        
        // Send position update to server
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerMove', {
                x: this.player.x,
                y: this.player.y,
                angle: this.player.angle
            });
        }
    }
    
    updateAI() {
        const currentTime = Date.now();
        
        this.players.forEach((aiPlayer) => {
            if (!aiPlayer.isAI) return;
            
            // Simple AI movement
            aiPlayer.x += aiPlayer.direction.x * 2;
            aiPlayer.y += aiPlayer.direction.y * 2;
            
            // Bounce off walls
            if (aiPlayer.x <= 20 || aiPlayer.x >= this.canvas.width - 20) {
                aiPlayer.direction.x *= -1;
            }
            if (aiPlayer.y <= 20 || aiPlayer.y >= this.canvas.height - 20) {
                aiPlayer.direction.y *= -1;
            }
            
            // Keep within bounds
            aiPlayer.x = Math.max(20, Math.min(this.canvas.width - 20, aiPlayer.x));
            aiPlayer.y = Math.max(20, Math.min(this.canvas.height - 20, aiPlayer.y));
            
            // AI shooting at player
            const distToPlayer = Math.sqrt(
                Math.pow(aiPlayer.x - this.player.x, 2) + 
                Math.pow(aiPlayer.y - this.player.y, 2)
            );
            
            if (distToPlayer < 200 && currentTime - aiPlayer.lastShot > 1000) {
                aiPlayer.angle = Math.atan2(this.player.y - aiPlayer.y, this.player.x - aiPlayer.x);
                this.createBullet(aiPlayer.x, aiPlayer.y, aiPlayer.angle, aiPlayer.id);
                aiPlayer.lastShot = currentTime;
            }
            
            // Random direction change
            if (Math.random() < 0.02) {
                aiPlayer.direction.x = Math.random() - 0.5;
                aiPlayer.direction.y = Math.random() - 0.5;
            }
        });
    }
    
    shoot() {
        if (this.inGame && this.socket && this.socket.connected) {
            this.socket.emit('shoot', {
                angle: this.player.angle
            });
        }
    }
    
    createBullet(x, y, angle, ownerId) {
        const bullet = {
            x: x,
            y: y,
            vx: Math.cos(angle) * this.bulletSpeed,
            vy: Math.sin(angle) * this.bulletSpeed,
            size: this.bulletSize,
            ownerId: ownerId,
            life: 100
        };
        this.bullets.push(bullet);
    }
    
    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            // Update position
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            bullet.life--;
            
            // Remove bullets that are off-screen or expired
            if (bullet.x < 0 || bullet.x > this.canvas.width || 
                bullet.y < 0 || bullet.y > this.canvas.height || 
                bullet.life <= 0) {
                this.bullets.splice(i, 1);
                continue;
            }
            
            // Check collision with player
            if (bullet.ownerId !== 'player' && this.checkBulletPlayerCollision(bullet, this.player)) {
                this.player.health -= 20;
                this.bullets.splice(i, 1);
                this.updateHealthDisplay();
                
                if (this.player.health <= 0) {
                    this.respawnPlayer();
                }
                continue;
            }
            
            // Check collision with AI players
            if (bullet.ownerId === 'player') {
                let hit = false;
                this.players.forEach((aiPlayer, id) => {
                    if (aiPlayer.isAI && this.checkBulletPlayerCollision(bullet, aiPlayer)) {
                        aiPlayer.health -= 20;
                        hit = true;
                        
                        if (aiPlayer.health <= 0) {
                            this.player.score += 10;
                            this.updateScoreDisplay();
                            this.respawnAIPlayer(aiPlayer);
                        }
                    }
                });
                
                if (hit) {
                    this.bullets.splice(i, 1);
                }
            }
        }
    }
    
    checkBulletPlayerCollision(bullet, player) {
        const dx = bullet.x - player.x;
        const dy = bullet.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < bullet.size + player.width / 2;
    }
    
    respawnPlayer() {
        this.player.health = this.player.maxHealth;
        this.player.x = Math.random() * (this.canvas.width - 40) + 20;
        this.player.y = Math.random() * (this.canvas.height - 40) + 20;
        this.updateHealthDisplay();
    }
    
    respawnAIPlayer(aiPlayer) {
        aiPlayer.health = aiPlayer.maxHealth;
        aiPlayer.x = Math.random() * (this.canvas.width - 40) + 20;
        aiPlayer.y = Math.random() * (this.canvas.height - 40) + 20;
    }
    
    render() {
        // Only render if we're in game
        if (!this.inGame) return;
        
        // Clear canvas
        this.ctx.fillStyle = this.mapData?.background || '#111';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid
        this.drawGrid();
        
        // Draw map elements
        this.drawMap();
        
        // Draw players
        this.drawPlayer(this.player, true);
        this.players.forEach((player) => {
            this.drawPlayer(player, false);
        });
        
        // Draw bullets
        this.drawBullets();
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x < this.canvas.width; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < this.canvas.height; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    drawPlayer(player, isMainPlayer) {
        this.ctx.save();
        
        // Player body
        this.ctx.fillStyle = player.color;
        this.ctx.fillRect(
            player.x - player.width/2, 
            player.y - player.height/2, 
            player.width, 
            player.height
        );
        
        // Player outline
        this.ctx.strokeStyle = isMainPlayer ? '#fff' : '#666';
        this.ctx.lineWidth = isMainPlayer ? 2 : 1;
        this.ctx.strokeRect(
            player.x - player.width/2, 
            player.y - player.height/2, 
            player.width, 
            player.height
        );
        
        // Gun barrel
        this.ctx.strokeStyle = player.color;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(player.x, player.y);
        this.ctx.lineTo(
            player.x + Math.cos(player.angle) * 25,
            player.y + Math.sin(player.angle) * 25
        );
        this.ctx.stroke();
        
        // Health bar for all players (always show for others, show for main player when damaged)
        const shouldShowHealthBar = !isMainPlayer || player.health < player.maxHealth;
        if (shouldShowHealthBar) {
            this.drawPlayerHealthBar(player, isMainPlayer);
        }
        
        // Player name tag for other players
        if (!isMainPlayer && player.name) {
            this.drawPlayerName(player);
        }
        
        this.ctx.restore();
    }
    
    drawPlayerHealthBar(player, isMainPlayer) {
        const barWidth = 40;
        const barHeight = 6;
        const barY = player.y - player.height/2 - 15;
        const healthPercent = Math.max(0, player.health) / (player.maxHealth || 100);
        
        // Health bar background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(
            player.x - barWidth/2 - 1, 
            barY - 1, 
            barWidth + 2, 
            barHeight + 2
        );
        
        // Health bar background (dark)
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(
            player.x - barWidth/2, 
            barY, 
            barWidth, 
            barHeight
        );
        
        // Health bar fill
        let healthColor;
        if (healthPercent > 0.6) {
            healthColor = '#4CAF50'; // Green
        } else if (healthPercent > 0.3) {
            healthColor = '#FF9800'; // Orange
        } else {
            healthColor = '#F44336'; // Red
        }
        
        this.ctx.fillStyle = healthColor;
        this.ctx.fillRect(
            player.x - barWidth/2, 
            barY, 
            barWidth * healthPercent, 
            barHeight
        );
        
        // Health bar border
        this.ctx.strokeStyle = isMainPlayer ? '#fff' : '#999';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(
            player.x - barWidth/2, 
            barY, 
            barWidth, 
            barHeight
        );
        
        // Health text for main player when severely damaged
        if (isMainPlayer && healthPercent < 0.5) {
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                `${Math.max(0, player.health)}`, 
                player.x, 
                barY - 2
            );
        }
    }
    
    drawPlayerName(player) {
        if (!player.name) return;
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        
        const nameY = player.y - player.height/2 - 25;
        
        // Text outline
        this.ctx.strokeText(player.name, player.x, nameY);
        // Text fill
        this.ctx.fillText(player.name, player.x, nameY);
    }
    
    drawMap() {
        if (!this.mapData) return;
        
        // Draw walls
        if (this.mapData.walls) {
            this.mapData.walls.forEach(wall => {
                this.drawWall(wall);
            });
        }
        
        // Draw powerups
        if (this.mapData.powerups) {
            this.mapData.powerups.forEach(powerup => {
                this.drawPowerup(powerup);
            });
        }
        
        // Draw hazards
        if (this.mapData.hazards) {
            this.mapData.hazards.forEach(hazard => {
                this.drawHazard(hazard);
            });
        }
    }
    
    drawWall(wall) {
        const colors = {
            wall: '#8B4513',
            cover: '#666',
            barrier: '#555',
            pillar: '#777'
        };
        
        this.ctx.save();
        
        // Different visual styles for different wall types
        if (wall.type === 'barrier') {
            // Semi-transparent barrier (bullets pass through)
            this.ctx.globalAlpha = 0.6;
            this.ctx.fillStyle = '#555';
            this.ctx.fillRect(
                wall.x - wall.width/2,
                wall.y - wall.height/2,
                wall.width,
                wall.height
            );
            
            // Diagonal stripes for barriers
            this.ctx.globalAlpha = 1;
            this.ctx.strokeStyle = '#777';
            this.ctx.lineWidth = 2;
            for (let i = 0; i < wall.width; i += 8) {
                this.ctx.beginPath();
                this.ctx.moveTo(wall.x - wall.width/2 + i, wall.y - wall.height/2);
                this.ctx.lineTo(wall.x - wall.width/2 + i + wall.height, wall.y + wall.height/2);
                this.ctx.stroke();
            }
        } else if (wall.type === 'cover') {
            // Semi-transparent cover (walkable through)
            this.ctx.globalAlpha = 0.8;
            this.ctx.fillStyle = colors[wall.type];
            this.ctx.fillRect(
                wall.x - wall.width/2,
                wall.y - wall.height/2,
                wall.width,
                wall.height
            );
            
            this.ctx.globalAlpha = 1;
            
            // Health-based visual state for destructible cover
            if (wall.properties?.destructible) {
                const healthPercent = (wall.properties.health || 100) / 100;
                
                // Add cracks based on damage
                if (healthPercent < 0.75) {
                    this.ctx.strokeStyle = '#444';
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(wall.x - wall.width/4, wall.y - wall.height/2);
                    this.ctx.lineTo(wall.x + wall.width/4, wall.y + wall.height/2);
                    this.ctx.stroke();
                }
                
                if (healthPercent < 0.5) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(wall.x + wall.width/4, wall.y - wall.height/2);
                    this.ctx.lineTo(wall.x - wall.width/4, wall.y + wall.height/2);
                    this.ctx.stroke();
                }
                
                if (healthPercent < 0.25) {
                    this.ctx.strokeStyle = '#222';
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(wall.x, wall.y - wall.height/2);
                    this.ctx.lineTo(wall.x, wall.y + wall.height/2);
                    this.ctx.stroke();
                }
            }
        } else {
            // Solid walls and pillars
            this.ctx.fillStyle = colors[wall.type] || '#666';
            this.ctx.fillRect(
                wall.x - wall.width/2,
                wall.y - wall.height/2,
                wall.width,
                wall.height
            );
        }
        
        // Border for all wall types
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(
            wall.x - wall.width/2,
            wall.y - wall.height/2,
            wall.width,
            wall.height
        );
        
        // Type indicator text
        this.ctx.fillStyle = 'white';
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const typeText = {
            wall: 'W',
            cover: 'C',
            barrier: 'B',
            pillar: 'P'
        };
        
        if (wall.width >= 20 && wall.height >= 20) {
            this.ctx.fillText(typeText[wall.type] || '?', wall.x, wall.y);
        }
        
        this.ctx.restore();
    }
    
    drawPowerup(powerup) {
        const colors = {
            health: '#FF4444',
            ammo: '#FF9800',
            shield: '#00BCD4',
            speed: '#9C27B0'
        };
        
        const symbols = {
            health: '❤️',
            ammo: '💥',
            shield: '🛡️',
            speed: '⚡'
        };
        
        this.ctx.save();
        
        // Pulsing effect
        const pulseScale = 0.9 + 0.1 * Math.sin(Date.now() * 0.005);
        const size = powerup.width * pulseScale;
        
        // Background circle
        this.ctx.fillStyle = colors[powerup.type] || '#FFD700';
        this.ctx.beginPath();
        this.ctx.arc(powerup.x, powerup.y, size/2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Border
        this.ctx.strokeStyle = '#FFF';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Symbol
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(symbols[powerup.type] || '?', powerup.x, powerup.y);
        
        this.ctx.restore();
    }
    
    drawHazard(hazard) {
        const colors = {
            spikes: '#FF4444',
            lava: '#FF5722',
            water: '#03A9F4'
        };
        
        this.ctx.save();
        
        // Animated effects for hazards
        const time = Date.now() * 0.001;
        
        if (hazard.type === 'spikes') {
            // Draw spiky pattern with animation
            this.ctx.fillStyle = colors[hazard.type];
            this.ctx.fillRect(
                hazard.x - hazard.width/2,
                hazard.y - hazard.height/2,
                hazard.width,
                hazard.height
            );
            
            // Animated spike pattern
            const intensity = 0.8 + 0.2 * Math.sin(time * 3);
            this.ctx.fillStyle = `rgba(170, 0, 0, ${intensity})`;
            const spikes = Math.floor(hazard.width / 10);
            for (let i = 0; i < spikes; i++) {
                this.ctx.beginPath();
                this.ctx.moveTo(hazard.x - hazard.width/2 + i * hazard.width/spikes, hazard.y + hazard.height/2);
                this.ctx.lineTo(hazard.x - hazard.width/2 + i * hazard.width/spikes + hazard.width/(spikes*2), hazard.y - hazard.height/2);
                this.ctx.lineTo(hazard.x - hazard.width/2 + (i + 1) * hazard.width/spikes, hazard.y + hazard.height/2);
                this.ctx.fill();
            }
        } else if (hazard.type === 'lava') {
            // Animated lava effect
            const bubbleIntensity = 0.7 + 0.3 * Math.sin(time * 2);
            this.ctx.fillStyle = colors[hazard.type];
            this.ctx.fillRect(
                hazard.x - hazard.width/2,
                hazard.y - hazard.height/2,
                hazard.width,
                hazard.height
            );
            
            // Lava bubbles
            this.ctx.fillStyle = `rgba(255, 140, 0, ${bubbleIntensity})`;
            for (let i = 0; i < 3; i++) {
                const bubbleX = hazard.x + (Math.sin(time + i) * hazard.width/4);
                const bubbleY = hazard.y + (Math.cos(time * 1.5 + i) * hazard.height/4);
                this.ctx.beginPath();
                this.ctx.arc(bubbleX, bubbleY, 3, 0, Math.PI * 2);
                this.ctx.fill();
            }
        } else if (hazard.type === 'water') {
            // Animated water effect
            const waveIntensity = 0.6 + 0.4 * Math.sin(time * 1.5);
            this.ctx.fillStyle = `rgba(3, 169, 244, ${waveIntensity})`;
            this.ctx.fillRect(
                hazard.x - hazard.width/2,
                hazard.y - hazard.height/2,
                hazard.width,
                hazard.height
            );
            
            // Water waves
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                this.ctx.beginPath();
                const waveY = hazard.y - hazard.height/2 + (i + 1) * hazard.height/4;
                this.ctx.moveTo(hazard.x - hazard.width/2, waveY);
                for (let x = -hazard.width/2; x <= hazard.width/2; x += 5) {
                    const y = waveY + Math.sin((time + x/10)) * 2;
                    this.ctx.lineTo(hazard.x + x, y);
                }
                this.ctx.stroke();
            }
        } else {
            // Default hazard rendering
            this.ctx.fillStyle = colors[hazard.type] || '#FF4444';
            this.ctx.fillRect(
                hazard.x - hazard.width/2,
                hazard.y - hazard.height/2,
                hazard.width,
                hazard.height
            );
        }
        
        // Danger border
        this.ctx.strokeStyle = '#AA0000';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(
            hazard.x - hazard.width/2,
            hazard.y - hazard.height/2,
            hazard.width,
            hazard.height
        );
        this.ctx.setLineDash([]);
        
        this.ctx.restore();
    }
    
    drawBullets() {
        this.ctx.fillStyle = '#FFD700';
        this.bullets.forEach((bullet) => {
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, bullet.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    
    updateHealthDisplay() {
        const healthFill = document.getElementById('healthFill');
        const healthText = document.getElementById('healthText');
        const healthContainer = document.getElementById('healthBarContainer');
        
        const healthPercent = Math.max(0, this.player.health) / this.player.maxHealth;
        healthFill.style.width = (healthPercent * 100) + '%';
        healthText.textContent = `${Math.max(0, this.player.health)}/${this.player.maxHealth}`;
        
        // Update health bar color based on health level
        healthFill.className = '';
        if (healthPercent <= 0.25) {
            healthFill.classList.add('critical');
        } else if (healthPercent <= 0.5) {
            healthFill.classList.add('low');
        }
        
        // Add regenerating indicator
        if (this.player.regenerating) {
            healthContainer.style.border = '2px solid #4CAF50';
            healthContainer.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';
        } else {
            healthContainer.style.border = '2px solid #555';
            healthContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
        }
    }
    
    updateScoreDisplay() {
        document.getElementById('score').textContent = this.player.score;
    }
    
    updatePlayerCount() {
        document.getElementById('playerCount').textContent = this.players.size + 1;
    }
    
    updateHealthRegeneration() {
        const currentTime = Date.now();
        const timeSinceDamage = currentTime - this.player.lastDamageTime;
        
        // Start regenerating 3 seconds after last damage
        if (timeSinceDamage > 3000 && this.player.health < this.player.maxHealth) {
            if (!this.player.regenerating) {
                this.player.regenerating = true;
                this.updateHealthDisplay();
            }
            
            // Regenerate 1 health every 200ms (5 health per second)
            if (timeSinceDamage % 200 < 16) { // roughly every 200ms at 60fps
                const oldHealth = this.player.health;
                this.player.health = Math.min(this.player.maxHealth, this.player.health + 1);
                
                if (this.player.health > oldHealth) {
                    this.showHealEffect(1);
                    this.updateHealthDisplay();
                }
                
                if (this.player.health >= this.player.maxHealth) {
                    this.player.regenerating = false;
                    this.updateHealthDisplay();
                }
            }
        }
    }
    
    showDamageEffect(damage) {
        // Flash health bar red
        const healthContainer = document.getElementById('healthBarContainer');
        healthContainer.classList.add('damaged');
        setTimeout(() => {
            healthContainer.classList.remove('damaged');
        }, 500);
        
        // Show floating damage number
        const damageElement = document.createElement('div');
        damageElement.className = 'damage-number';
        damageElement.textContent = `-${damage}`;
        damageElement.style.left = '120px';
        damageElement.style.top = '25px';
        
        healthContainer.appendChild(damageElement);
        
        setTimeout(() => {
            if (damageElement.parentNode) {
                damageElement.parentNode.removeChild(damageElement);
            }
        }, 1500);
    }
    
    showHealEffect(healAmount) {
        // Show floating heal number
        const healElement = document.createElement('div');
        healElement.className = 'heal-number';
        healElement.textContent = `+${healAmount}`;
        healElement.style.left = '120px';
        healElement.style.top = '25px';
        
        const healthContainer = document.getElementById('healthBarContainer');
        healthContainer.appendChild(healElement);
        
        setTimeout(() => {
            if (healElement.parentNode) {
                healElement.parentNode.removeChild(healElement);
            }
        }, 1200);
    }
    
    showRespawnEffect() {
        // Flash the screen green briefly to indicate respawn
        const respawnOverlay = document.createElement('div');
        respawnOverlay.style.position = 'fixed';
        respawnOverlay.style.top = '0';
        respawnOverlay.style.left = '0';
        respawnOverlay.style.width = '100%';
        respawnOverlay.style.height = '100%';
        respawnOverlay.style.backgroundColor = 'rgba(76, 175, 80, 0.3)';
        respawnOverlay.style.pointerEvents = 'none';
        respawnOverlay.style.zIndex = '9999';
        respawnOverlay.style.animation = 'respawnFlash 1s ease-out forwards';
        
        document.body.appendChild(respawnOverlay);
        
        // Add the animation CSS if it doesn't exist
        if (!document.getElementById('respawnAnimation')) {
            const style = document.createElement('style');
            style.id = 'respawnAnimation';
            style.textContent = `
                @keyframes respawnFlash {
                    0% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        setTimeout(() => {
            if (respawnOverlay.parentNode) {
                respawnOverlay.parentNode.removeChild(respawnOverlay);
            }
        }, 1000);
        
        // Show respawn message
        const respawnText = document.createElement('div');
        respawnText.style.position = 'fixed';
        respawnText.style.top = '50%';
        respawnText.style.left = '50%';
        respawnText.style.transform = 'translate(-50%, -50%)';
        respawnText.style.color = '#4CAF50';
        respawnText.style.fontSize = '24px';
        respawnText.style.fontWeight = 'bold';
        respawnText.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        respawnText.style.pointerEvents = 'none';
        respawnText.style.zIndex = '10000';
        respawnText.style.animation = 'respawnText 2s ease-out forwards';
        respawnText.textContent = 'RESPAWNED!';
        
        document.body.appendChild(respawnText);
        
        // Add text animation CSS if it doesn't exist
        if (!document.getElementById('respawnTextAnimation')) {
            const style = document.createElement('style');
            style.id = 'respawnTextAnimation';
            style.textContent = `
                @keyframes respawnText {
                    0% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                    50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                }
            `;
            document.head.appendChild(style);
        }
        
        setTimeout(() => {
            if (respawnText.parentNode) {
                respawnText.parentNode.removeChild(respawnText);
            }
        }, 2000);
    }
    
    showOtherPlayerDamageEffect(player, damage) {
        // This could be expanded to show visual effects for other players
        // For now, the health bar update is enough visual feedback
    }
    
    showHazardDamageEffect(damage, hazardType) {
        // Show different colored damage effect for hazards
        const healthContainer = document.getElementById('healthBarContainer');
        
        const colors = {
            spikes: 'rgba(255, 68, 68, 0.8)',
            lava: 'rgba(255, 87, 34, 0.8)',
            water: 'rgba(3, 169, 244, 0.8)'
        };
        
        healthContainer.style.background = colors[hazardType] || 'rgba(255, 0, 0, 0.8)';
        healthContainer.style.transform = 'scale(1.05)';
        
        setTimeout(() => {
            healthContainer.style.background = 'rgba(0, 0, 0, 0.8)';
            healthContainer.style.transform = 'scale(1)';
        }, 500);
        
        // Show floating damage number with hazard icon
        const damageElement = document.createElement('div');
        damageElement.className = 'damage-number';
        
        const hazardIcons = {
            spikes: '🔺',
            lava: '🔥',
            water: '🌊'
        };
        
        damageElement.textContent = `${hazardIcons[hazardType] || '⚠️'} -${damage}`;
        damageElement.style.left = '120px';
        damageElement.style.top = '25px';
        damageElement.style.color = '#FF6B6B';
        
        healthContainer.appendChild(damageElement);
        
        setTimeout(() => {
            if (damageElement.parentNode) {
                damageElement.parentNode.removeChild(damageElement);
            }
        }, 1500);
    }
    
    showCoverDestroyedEffect(wallId) {
        // Visual effect when cover is destroyed
        // Could add explosion particles or debris
        console.log(`Cover ${wallId} destroyed!`);
    }
    
    showOtherPlayerRespawnEffect(player) {
        // Visual effect when other players respawn
        // Could add a brief glow or particle effect around the player
    }
    
    checkWallCollision(x, y) {
        if (!this.mapData || !this.mapData.walls) return false;
        
        // Use player dimensions for more accurate collision detection
        const playerLeft = x - this.player.width/2;
        const playerRight = x + this.player.width/2;
        const playerTop = y - this.player.height/2;
        const playerBottom = y + this.player.height/2;
        
        for (let wall of this.mapData.walls) {
            // Only walls, pillars, and barriers block player movement
            // Cover is walkable through
            if (wall.type === 'wall' || wall.type === 'pillar' || wall.type === 'barrier') {
                const wallLeft = wall.x - wall.width/2;
                const wallRight = wall.x + wall.width/2;
                const wallTop = wall.y - wall.height/2;
                const wallBottom = wall.y + wall.height/2;
                
                // Check for overlap (AABB collision detection)
                if (playerLeft < wallRight && playerRight > wallLeft &&
                    playerTop < wallBottom && playerBottom > wallTop) {
                    return true;
                }
            }
        }
        return false;
    }
    
    gameLoop() {
        this.updateInput();
        this.render();
        
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Global game instance
let game;

// Global functions for lobby (called from HTML)
function leaveRoom() {
    if (game && game.socket) {
        game.socket.emit('leaveRoom');
        game.inGame = false;
        game.currentRoom = null;
        showLobby();
    }
}

function showLobby() {
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('gameScreen').classList.add('hidden');
}

function showGame() {
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
}

// Start the game when the page loads
window.addEventListener('load', () => {
    game = new Game();
    // Make game available globally for debugging
    window.game = game;
});

