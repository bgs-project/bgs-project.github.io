// Map Editor JavaScript
class MapEditor {
    constructor() {
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gridCanvas = document.getElementById('gridCanvas');
        this.gridCtx = this.gridCanvas.getContext('2d');
        
        // Editor state
        this.currentTool = 'select';
        this.selectedObject = null;
        this.selectedObjectId = null;
        this.dragging = false;
        this.dragOffset = { x: 0, y: 0 };
        
        // Map data
        this.mapData = {
            name: 'new_map',
            width: 800,
            height: 600,
            objects: [],
            spawns: [],
            background: '#111'
        };
        
        // Object counter for unique IDs
        this.objectIdCounter = 0;
        
        // Grid settings
        this.gridSize = 20;
        this.snapToGrid = true;
        
        // Layers visibility
        this.layers = {
            grid: true,
            objects: true,
            spawns: true
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.drawGrid();
        this.updateObjectList();
        this.setStatus('Ready');
    }
    
    setupEventListeners() {
        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('click', (e) => this.onClick(e));
        
        // Drag and drop events
        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            this.onDrop(e);
        });
        
        // Tool items drag events
        document.querySelectorAll('[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', e.target.dataset.type);
            });
        });
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        // Map size change
        document.getElementById('mapSize').addEventListener('change', (e) => {
            this.changeMapSize(e.target.value);
        });
        
        // Map name change
        document.getElementById('mapName').addEventListener('input', (e) => {
            this.mapData.name = e.target.value;
        });
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    snapToGridPos(x, y) {
        if (!this.snapToGrid) return { x, y };
        return {
            x: Math.round(x / this.gridSize) * this.gridSize,
            y: Math.round(y / this.gridSize) * this.gridSize
        };
    }
    
    onMouseDown(e) {
        const pos = this.getMousePos(e);
        
        if (this.currentTool === 'select') {
            const object = this.getObjectAt(pos.x, pos.y);
            if (object) {
                this.selectObject(object);
                this.dragging = true;
                this.dragOffset = {
                    x: pos.x - object.x,
                    y: pos.y - object.y
                };
            } else {
                this.selectObject(null);
            }
        }
    }
    
    onMouseMove(e) {
        const pos = this.getMousePos(e);
        document.getElementById('coordinates').textContent = `${Math.round(pos.x)}, ${Math.round(pos.y)}`;
        
        if (this.dragging && this.selectedObject && this.currentTool === 'select') {
            const newPos = this.snapToGridPos(
                pos.x - this.dragOffset.x,
                pos.y - this.dragOffset.y
            );
            
            this.selectedObject.x = Math.max(0, Math.min(this.mapData.width, newPos.x));
            this.selectedObject.y = Math.max(0, Math.min(this.mapData.height, newPos.y));
            
            this.render();
            this.updateObjectProperties();
        }
    }
    
    onMouseUp(e) {
        this.dragging = false;
    }
    
    onClick(e) {
        const pos = this.getMousePos(e);
        
        if (this.currentTool === 'erase') {
            const object = this.getObjectAt(pos.x, pos.y);
            if (object) {
                this.deleteObject(object.id);
            }
        }
    }
    
    onDrop(e) {
        const objectType = e.dataTransfer.getData('text/plain');
        const pos = this.getMousePos(e);
        const snappedPos = this.snapToGridPos(pos.x, pos.y);
        
        this.createObject(objectType, snappedPos.x, snappedPos.y);
    }
    
    onKeyDown(e) {
        if (e.key === 'Delete' && this.selectedObject) {
            this.deleteObject(this.selectedObject.id);
        }
        
        if (e.key === 'Escape') {
            this.selectObject(null);
        }
        
        // Tool shortcuts
        if (e.key === 's' && !e.ctrlKey) {
            this.selectTool('select');
        }
        if (e.key === 'e' && !e.ctrlKey) {
            this.selectTool('erase');
        }
        
        // Save shortcut
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveMap();
        }
    }
    
    createObject(type, x, y) {
        const object = {
            id: ++this.objectIdCounter,
            type: type,
            x: x,
            y: y,
            width: this.getDefaultSize(type).width,
            height: this.getDefaultSize(type).height,
            properties: this.getDefaultProperties(type)
        };
        
        if (this.isSpawnType(type)) {
            this.mapData.spawns.push(object);
        } else {
            this.mapData.objects.push(object);
        }
        
        this.render();
        this.updateObjectList();
        this.selectObject(object);
        this.setStatus(`Created ${type} at (${x}, ${y})`);
    }
    
    deleteObject(objectId) {
        // Remove from objects array
        this.mapData.objects = this.mapData.objects.filter(obj => obj.id !== objectId);
        // Remove from spawns array
        this.mapData.spawns = this.mapData.spawns.filter(obj => obj.id !== objectId);
        
        if (this.selectedObjectId === objectId) {
            this.selectObject(null);
        }
        
        this.render();
        this.updateObjectList();
        this.setStatus('Object deleted');
    }
    
    getObjectAt(x, y) {
        // Check spawns first (they should be on top)
        for (let spawn of this.mapData.spawns) {
            if (x >= spawn.x - spawn.width/2 && x <= spawn.x + spawn.width/2 &&
                y >= spawn.y - spawn.height/2 && y <= spawn.y + spawn.height/2) {
                return spawn;
            }
        }
        
        // Check objects
        for (let obj of this.mapData.objects) {
            if (x >= obj.x - obj.width/2 && x <= obj.x + obj.width/2 &&
                y >= obj.y - obj.height/2 && y <= obj.y + obj.height/2) {
                return obj;
            }
        }
        
        return null;
    }
    
    selectObject(object) {
        this.selectedObject = object;
        this.selectedObjectId = object ? object.id : null;
        this.render();
        this.updateObjectProperties();
        this.updateObjectList();
    }
    
    getDefaultSize(type) {
        const sizes = {
            wall: { width: 40, height: 40 },
            cover: { width: 40, height: 20 },
            barrier: { width: 60, height: 20 },
            pillar: { width: 20, height: 20 },
            spawn: { width: 30, height: 30 },
            team_spawn_a: { width: 30, height: 30 },
            team_spawn_b: { width: 30, height: 30 },
            health: { width: 20, height: 20 },
            ammo: { width: 20, height: 20 },
            shield: { width: 20, height: 20 },
            speed: { width: 20, height: 20 },
            spikes: { width: 30, height: 30 },
            lava: { width: 40, height: 40 },
            water: { width: 60, height: 60 }
        };
        return sizes[type] || { width: 20, height: 20 };
    }
    
    getDefaultProperties(type) {
        const properties = {
            wall: { solid: true, destructible: false },
            cover: { solid: true, destructible: true, health: 100 },
            barrier: { solid: true, destructible: false },
            pillar: { solid: true, destructible: false },
            spawn: { team: 'neutral' },
            team_spawn_a: { team: 'a' },
            team_spawn_b: { team: 'b' },
            health: { healAmount: 50, respawnTime: 30 },
            ammo: { ammoAmount: 30, respawnTime: 20 },
            shield: { shieldAmount: 50, respawnTime: 45 },
            speed: { speedMultiplier: 1.5, duration: 10, respawnTime: 60 },
            spikes: { damage: 30, damageInterval: 1 },
            lava: { damage: 20, damageInterval: 0.5 },
            water: { speedMultiplier: 0.5 }
        };
        return properties[type] || {};
    }
    
    isSpawnType(type) {
        return ['spawn', 'team_spawn_a', 'team_spawn_b'].includes(type);
    }
    
    render() {
        // Clear canvas
        this.ctx.fillStyle = this.mapData.background;
        this.ctx.fillRect(0, 0, this.mapData.width, this.mapData.height);
        
        if (this.layers.objects) {
            this.renderObjects();
        }
        
        if (this.layers.spawns) {
            this.renderSpawns();
        }
        
        this.renderSelection();
    }
    
    renderObjects() {
        this.mapData.objects.forEach(obj => {
            this.drawObject(obj);
        });
    }
    
    renderSpawns() {
        this.mapData.spawns.forEach(spawn => {
            this.drawSpawn(spawn);
        });
    }
    
    drawObject(obj) {
        const colors = {
            wall: '#8B4513',
            cover: '#666',
            barrier: '#555',
            pillar: '#777',
            health: '#FF4444',
            ammo: '#FF9800',
            shield: '#00BCD4',
            speed: '#9C27B0',
            spikes: '#FF4444',
            lava: '#FF5722',
            water: '#03A9F4'
        };
        
        this.ctx.save();
        this.ctx.fillStyle = colors[obj.type] || '#666';
        this.ctx.fillRect(
            obj.x - obj.width/2,
            obj.y - obj.height/2,
            obj.width,
            obj.height
        );
        
        // Border
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(
            obj.x - obj.width/2,
            obj.y - obj.height/2,
            obj.width,
            obj.height
        );
        
        // Type indicator (emoji/text)
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const symbols = {
            wall: '🧱',
            cover: '📦',
            barrier: '🚧',
            pillar: '🏛',
            health: '❤',
            ammo: '💥',
            shield: '🛡',
            speed: '⚡',
            spikes: '🔺',
            lava: '🔥',
            water: '🌊'
        };
        
        this.ctx.fillText(symbols[obj.type] || '?', obj.x, obj.y);
        this.ctx.restore();
    }
    
    drawSpawn(spawn) {
        const colors = {
            spawn: '#4CAF50',
            team_spawn_a: '#2196F3',
            team_spawn_b: '#f44336'
        };
        
        this.ctx.save();
        
        // Draw circle for spawn points
        this.ctx.fillStyle = colors[spawn.type] || '#4CAF50';
        this.ctx.beginPath();
        this.ctx.arc(spawn.x, spawn.y, spawn.width/2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Border
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Symbol
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const symbols = {
            spawn: '🎯',
            team_spawn_a: 'A',
            team_spawn_b: 'B'
        };
        
        this.ctx.fillText(symbols[spawn.type] || '?', spawn.x, spawn.y);
        this.ctx.restore();
    }
    
    renderSelection() {
        if (this.selectedObject) {
            this.ctx.save();
            this.ctx.strokeStyle = '#4CAF50';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            
            if (this.isSpawnType(this.selectedObject.type)) {
                // Draw circle selection for spawns
                this.ctx.beginPath();
                this.ctx.arc(
                    this.selectedObject.x,
                    this.selectedObject.y,
                    this.selectedObject.width/2 + 5,
                    0, Math.PI * 2
                );
                this.ctx.stroke();
            } else {
                // Draw rectangle selection for objects
                this.ctx.strokeRect(
                    this.selectedObject.x - this.selectedObject.width/2 - 3,
                    this.selectedObject.y - this.selectedObject.height/2 - 3,
                    this.selectedObject.width + 6,
                    this.selectedObject.height + 6
                );
            }
            
            this.ctx.restore();
        }
    }
    
    drawGrid() {
        if (!this.layers.grid) {
            this.gridCtx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
            return;
        }
        
        this.gridCtx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
        this.gridCtx.strokeStyle = '#333';
        this.gridCtx.lineWidth = 1;
        
        // Draw vertical lines
        for (let x = 0; x <= this.mapData.width; x += this.gridSize) {
            this.gridCtx.beginPath();
            this.gridCtx.moveTo(x, 0);
            this.gridCtx.lineTo(x, this.mapData.height);
            this.gridCtx.stroke();
        }
        
        // Draw horizontal lines
        for (let y = 0; y <= this.mapData.height; y += this.gridSize) {
            this.gridCtx.beginPath();
            this.gridCtx.moveTo(0, y);
            this.gridCtx.lineTo(this.mapData.width, y);
            this.gridCtx.stroke();
        }
    }
    
    updateObjectProperties() {
        const panel = document.getElementById('objectProperties');
        
        if (!this.selectedObject) {
            panel.innerHTML = '<p style="color: #888; font-size: 12px;">No object selected</p>';
            return;
        }
        
        const obj = this.selectedObject;
        let html = `
            <div class="control-group">
                <label>Type:</label>
                <input type="text" value="${obj.type}" readonly style="background: #333;">
            </div>
            <div class="control-group">
                <label>Position X:</label>
                <input type="number" value="${obj.x}" onchange="editor.updateObjectProperty('x', parseInt(this.value))">
            </div>
            <div class="control-group">
                <label>Position Y:</label>
                <input type="number" value="${obj.y}" onchange="editor.updateObjectProperty('y', parseInt(this.value))">
            </div>
            <div class="control-group">
                <label>Width:</label>
                <input type="number" value="${obj.width}" onchange="editor.updateObjectProperty('width', parseInt(this.value))">
            </div>
            <div class="control-group">
                <label>Height:</label>
                <input type="number" value="${obj.height}" onchange="editor.updateObjectProperty('height', parseInt(this.value))">
            </div>
        `;
        
        // Add custom properties based on object type
        Object.entries(obj.properties).forEach(([key, value]) => {
            if (typeof value === 'boolean') {
                html += `
                    <div class="control-group">
                        <label>${key}:</label>
                        <input type="checkbox" ${value ? 'checked' : ''} onchange="editor.updateObjectProperty('properties.${key}', this.checked)">
                    </div>
                `;
            } else {
                html += `
                    <div class="control-group">
                        <label>${key}:</label>
                        <input type="number" value="${value}" onchange="editor.updateObjectProperty('properties.${key}', parseFloat(this.value))">
                    </div>
                `;
            }
        });
        
        html += '<button class="btn danger" onclick="editor.deleteObject(editor.selectedObject.id)">Delete Object</button>';
        
        panel.innerHTML = html;
    }
    
    updateObjectProperty(path, value) {
        if (!this.selectedObject) return;
        
        const keys = path.split('.');
        let obj = this.selectedObject;
        
        for (let i = 0; i < keys.length - 1; i++) {
            obj = obj[keys[i]];
        }
        
        obj[keys[keys.length - 1]] = value;
        
        this.render();
        this.updateObjectList();
    }
    
    updateObjectList() {
        const list = document.getElementById('objectList');
        const allObjects = [...this.mapData.objects, ...this.mapData.spawns];
        
        if (allObjects.length === 0) {
            list.innerHTML = '<p style="color: #888; font-size: 12px;">No objects placed</p>';
            return;
        }
        
        let html = '';
        allObjects.forEach(obj => {
            const isSelected = this.selectedObjectId === obj.id;
            html += `
                <div class="object-item ${isSelected ? 'selected' : ''}" onclick="editor.selectObjectById(${obj.id})">
                    <span>${obj.type} (${obj.x}, ${obj.y})</span>
                    <button class="delete-btn" onclick="event.stopPropagation(); editor.deleteObject(${obj.id})">×</button>
                </div>
            `;
        });
        
        list.innerHTML = html;
    }
    
    selectObjectById(id) {
        const object = [...this.mapData.objects, ...this.mapData.spawns].find(obj => obj.id === id);
        this.selectObject(object);
    }
    
    changeMapSize(sizeString) {
        const [width, height] = sizeString.split('x').map(Number);
        this.mapData.width = width;
        this.mapData.height = height;
        
        this.canvas.width = width;
        this.canvas.height = height;
        this.gridCanvas.width = width;
        this.gridCanvas.height = height;
        
        this.drawGrid();
        this.render();
        this.setStatus(`Map size changed to ${width}x${height}`);
    }
    
    setStatus(message) {
        document.getElementById('mapStatus').textContent = message;
        setTimeout(() => {
            document.getElementById('mapStatus').textContent = 'Ready';
        }, 3000);
    }
}

// Global editor instance
let editor;

// Global functions
function selectTool(tool) {
    editor.currentTool = tool;
    
    // Update UI
    document.querySelectorAll('[data-tool]').forEach(item => {
        item.classList.remove('selected');
    });
    document.querySelector(`[data-tool="${tool}"]`).classList.add('selected');
    
    editor.setStatus(`Selected ${tool} tool`);
}

function toggleLayer(layer) {
    editor.layers[layer] = !editor.layers[layer];
    
    // Update UI
    const btn = event.target;
    btn.classList.toggle('active');
    
    if (layer === 'grid') {
        editor.drawGrid();
    } else {
        editor.render();
    }
}

function newMap() {
    if (confirm('Create a new map? This will clear the current map.')) {
        editor.mapData = {
            name: document.getElementById('mapName').value || 'new_map',
            width: 800,
            height: 600,
            objects: [],
            spawns: [],
            background: '#111'
        };
        
        editor.selectedObject = null;
        editor.selectedObjectId = null;
        editor.objectIdCounter = 0;
        
        editor.changeMapSize('800x600');
        editor.updateObjectList();
        editor.updateObjectProperties();
        editor.setStatus('New map created');
    }
}

function saveMap() {
    const mapJson = JSON.stringify(editor.mapData, null, 2);
    const blob = new Blob([mapJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editor.mapData.name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    editor.setStatus('Map saved!');
}

function exportMap() {
    // Export for game use (clean format)
    const exportData = {
        name: editor.mapData.name,
        width: editor.mapData.width,
        height: editor.mapData.height,
        walls: editor.mapData.objects.filter(obj => ['wall', 'cover', 'barrier', 'pillar'].includes(obj.type)),
        spawns: editor.mapData.spawns,
        powerups: editor.mapData.objects.filter(obj => ['health', 'ammo', 'shield', 'speed'].includes(obj.type)),
        hazards: editor.mapData.objects.filter(obj => ['spikes', 'lava', 'water'].includes(obj.type))
    };
    
    const mapJson = JSON.stringify(exportData, null, 2);
    const blob = new Blob([mapJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editor.mapData.name}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    editor.setStatus('Map exported for game!');
}

function loadMap(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const mapData = JSON.parse(e.target.result);
            
            // Validate map data
            if (!mapData.name || !mapData.width || !mapData.height) {
                throw new Error('Invalid map file format');
            }
            
            editor.mapData = {
                name: mapData.name,
                width: mapData.width,
                height: mapData.height,
                objects: mapData.objects || [],
                spawns: mapData.spawns || [],
                background: mapData.background || '#111'
            };
            
            // Update object ID counter
            const allObjects = [...editor.mapData.objects, ...editor.mapData.spawns];
            editor.objectIdCounter = allObjects.length > 0 ? Math.max(...allObjects.map(obj => obj.id)) : 0;
            
            // Update UI
            document.getElementById('mapName').value = mapData.name;
            document.getElementById('mapSize').value = `${mapData.width}x${mapData.height}`;
            
            editor.changeMapSize(`${mapData.width}x${mapData.height}`);
            editor.updateObjectList();
            editor.updateObjectProperties();
            editor.selectObject(null);
            
            editor.setStatus('Map loaded successfully!');
        } catch (error) {
            alert('Error loading map: ' + error.message);
        }
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}

// Initialize editor when page loads
window.addEventListener('load', () => {
    editor = new MapEditor();
    selectTool('select'); // Set default tool
});

