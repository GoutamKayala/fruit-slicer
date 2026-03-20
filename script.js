/**
 * Premium Gesture Fruit Slicer - Web Engine
 * Features: Circular PiP, Animated Dojo, Advanced Particles
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const videoElement = document.getElementById('input-video');
const pipCanvas = document.getElementById('pip-canvas');
const pipCtx = pipCanvas.getContext('2d');

// --- Configs ---
const WIDTH = 1280;
const HEIGHT = 720;
canvas.width = WIDTH;
canvas.height = HEIGHT;
pipCanvas.width = 160;
pipCanvas.height = 160;

const STATE_MENU = 0;
const STATE_LEVEL_SELECT = 1;
const STATE_PLAYING = 2;
const STATE_GAMEOVER = 3;

let gameState = STATE_MENU;
let score = 0;
let bestScore = localStorage.getItem('slicer_best') || 0;
let lives = 5;
let difficulty = 1; 

const LEVEL_CONFIGS = [
    { name: "EASY", gravity: 0.12, spawnRate: 0.015, velThreshold: 12, bombRate: 0.003 },
    { name: "MEDIUM", gravity: 0.22, spawnRate: 0.03, velThreshold: 18, bombRate: 0.006 },
    { name: "HARD", gravity: 0.35, spawnRate: 0.045, velThreshold: 25, bombRate: 0.012 }
];

// Entities
let fruits = [];
let bombs = [];
let particles = [];
let trail = []; 
const TRAIL_MAX = 10;

// --- Background System ---
class DojoBackground {
    constructor() {
        this.timer = 0;
    }
    draw(ctx) {
        this.timer += 0.02;
        // Deep Wood Floor
        ctx.fillStyle = '#1a120b';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        
        // Wall Panels
        ctx.strokeStyle = '#2c1e14';
        ctx.lineWidth = 2;
        for (let i = 0; i <= WIDTH; i += 128) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, HEIGHT);
            ctx.stroke();
        }

        // Animated Shadow/Mist
        for (let i = 0; i < 5; i++) {
            const y = (i * 150 + Math.sin(this.timer + i) * 20);
            const alpha = 0.05 + Math.sin(this.timer * 0.5 + i) * 0.02;
            ctx.fillStyle = `rgba(0,0,0,${alpha})`;
            ctx.fillRect(0, y, WIDTH, 80);
        }
    }
}
const background = new DojoBackground();

// --- MediaPipe JS Setup ---
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

let currentHand = null;
let rawLandmarks = null;

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        rawLandmarks = results.multiHandLandmarks[0];
        // Index tip (landmark 8)
        currentHand = {
            x: rawLandmarks[8].x * WIDTH, 
            y: rawLandmarks[8].y * HEIGHT
        };
    } else {
        currentHand = null;
        rawLandmarks = null;
    }
    document.getElementById('loading').classList.add('hidden');
});

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
        drawPiP();
    },
    width: 640,
    height: 480
});
camera.start();

// --- PiP Rendering ---
function drawPiP() {
    pipCtx.clearRect(0, 0, 160, 160);
    
    // Draw Video Feed (Center Cropped)
    // Source: 640x480. Target: 160x160 circle.
    // Mirroring is handled by CSS transform on container
    const size = 480;
    const sx = (640 - size) / 2;
    const sy = 0;
    pipCtx.drawImage(videoElement, sx, sy, size, size, 0, 0, 160, 160);
    
    // Draw Landmarks
    if (rawLandmarks) {
        // Draw connections
        pipCtx.strokeStyle = '#ffc832';
        pipCtx.lineWidth = 2;
        // Simple palm drawing for PiP
        const points = [0, 5, 9, 13, 17, 0];
        pipCtx.beginPath();
        points.forEach((idx, i) => {
            // Mirror coordinates for PiP (since container is flipped)
            const px = (rawLandmarks[idx].x * 160);
            const py = rawLandmarks[idx].y * 160;
            if (i === 0) pipCtx.moveTo(px, py);
            else pipCtx.lineTo(px, py);
        });
        pipCtx.stroke();

        // Highlight index (8)
        const ix = rawLandmarks[8].x * 160;
        const iy = rawLandmarks[8].y * 160;
        pipCtx.fillStyle = '#64ff64';
        pipCtx.beginPath();
        pipCtx.arc(ix, iy, 5, 0, Math.PI * 2);
        pipCtx.fill();
        pipCtx.strokeStyle = '#fff';
        pipCtx.stroke();
    }
}

// --- Entity Classes ---

class Fruit {
    constructor(gravity) {
        this.radius = 38;
        this.x = Math.random() * (WIDTH - 200) + 100;
        this.y = HEIGHT + 20;
        this.velX = (this.x < WIDTH / 2 ? 1 : -1) * (2 + Math.random() * 4);
        this.velY = -(16 + Math.random() * 8);
        this.gravity = gravity;
        this.color = `hsl(${Math.random() * 360}, 75%, 55%)`;
        this.isSliced = false;
        this.sliceAngle = 0;
        this.opacity = 1.0;
    }

    update() {
        this.x += this.velX;
        this.y += this.velY;
        this.velY += this.gravity;
        if (this.isSliced) this.opacity -= 0.02;
    }

    draw(ctx) {
        if (!this.isSliced) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = this.color;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(this.x - 10, this.y - 10, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            ctx.globalAlpha = this.opacity;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.sliceAngle);
            ctx.fillStyle = this.color;
            // Half 1
            ctx.beginPath(); ctx.arc(0, -10, this.radius, Math.PI, 0); ctx.fill();
            // Half 2
            ctx.beginPath(); ctx.arc(0, 10, this.radius, 0, Math.PI); ctx.fill();
            ctx.restore();
            ctx.globalAlpha = 1;
        }
    }
}

class Bomb {
    constructor(gravity) {
        this.radius = 42;
        this.x = Math.random() * (WIDTH - 200) + 100;
        this.y = HEIGHT + 20;
        this.velX = (Math.random() - 0.5) * 6;
        this.velY = -(14 + Math.random() * 6);
        this.gravity = gravity * 0.8;
    }
    update() {
        this.x += this.velX;
        this.y += this.velY;
        this.velY += this.gravity;
    }
    draw(ctx) {
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#ff4400';
        ctx.lineWidth = 4;
        ctx.stroke();
        // Red core
        ctx.fillStyle = '#f00';
        ctx.beginPath(); ctx.arc(this.x, this.y, 8, 0, Math.PI*2); ctx.fill();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.velX = (Math.random() - 0.5) * 12;
        this.velY = (Math.random() - 0.5) * 12;
        this.color = color;
        this.life = 1.0;
        this.size = 4 + Math.random() * 6;
    }
    update() {
        this.x += this.velX;
        this.y += this.velY;
        this.velY += 0.2; // Gravity
        this.life -= 0.02;
    }
    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// --- Systems ---

function checkCollisions() {
    if (trail.length < 2) return;
    const config = LEVEL_CONFIGS[difficulty];

    for (let i = 0; i < trail.length - 1; i++) {
        const p1 = trail[i];
        const p2 = trail[i+1];
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        fruits.forEach(f => {
            if (!f.isSliced && lineCircleIntersect(p1, p2, f, f.radius + 20)) {
                f.isSliced = true;
                f.sliceAngle = angle;
                score += 10;
                if (score > bestScore) {
                    bestScore = score;
                    localStorage.setItem('slicer_best', bestScore);
                }
                for (let j = 0; j < 12; j++) particles.push(new Particle(f.x, f.y, f.color));
            }
        });

        bombs.forEach((b, idx) => {
            if (lineCircleIntersect(p1, p2, b, b.radius + 5)) {
                lives = 0; // Instant death for bomb
                endGame();
            }
        });
    }
}

function lineCircleIntersect(p1, p2, circle, r) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const fx = p1.x - circle.x;
    const fy = p1.y - circle.y;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = (fx * fx + fy * fy) - r * r;
    if (a === 0) return false;
    let disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / (2 * a);
    const t2 = (-b + disc) / (2 * a);
    return (Math.max(0, t1) <= Math.min(1, t2));
}

// --- Loop ---

function gameLoop() {
    background.draw(ctx);

    if (gameState === STATE_PLAYING) {
        const config = LEVEL_CONFIGS[difficulty];
        // Spawn
        if (Math.random() < config.spawnRate + (score/10000)) fruits.push(new Fruit(config.gravity));
        if (Math.random() < config.bombRate) bombs.push(new Bomb(config.gravity));

        // Update/Draw
        fruits = fruits.filter(f => {
            f.update(); f.draw(ctx);
            if (f.y > HEIGHT + 100) {
                if (!f.isSliced) lives--;
                return false;
            }
            return f.opacity > 0;
        });

        bombs = bombs.filter(b => {
            b.update(); b.draw(ctx);
            return b.y <= HEIGHT + 100;
        });

        particles = particles.filter(p => {
            p.update(); p.draw(ctx);
            return p.life > 0;
        });

        // Trail
        if (currentHand) {
            trail.push({...currentHand});
            if (trail.length > TRAIL_MAX) trail.shift();
            checkCollisions();
        } else {
            trail = [];
        }

        // Draw Golden Trail
        if (trail.length > 2) {
            ctx.lineCap = 'round';
            for (let i = 0; i < trail.length - 1; i++) {
                ctx.strokeStyle = `rgba(255, 200, 50, ${i/trail.length})`;
                ctx.lineWidth = i * 2.5;
                ctx.beginPath();
                ctx.moveTo(trail[i].x, trail[i].y);
                ctx.lineTo(trail[i+1].x, trail[i+1].y);
                ctx.stroke();
            }
        }

        updateHUD();
        if (lives <= 0) endGame();
    }

    requestAnimationFrame(gameLoop);
}

// --- UI ---
function startGame() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('level-select').classList.remove('hidden');
}

function setLevel(lvl) {
    difficulty = lvl;
    resetGame();
    gameState = STATE_PLAYING;
    document.getElementById('level-select').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
}

function resetGame() {
    score = 0;
    lives = 5;
    fruits = [];
    bombs = [];
    particles = [];
    trail = [];
}

function showLevelSelect() {
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('level-select').classList.remove('hidden');
}

function endGame() {
    gameState = STATE_GAMEOVER;
    document.getElementById('final-score').innerText = `SCORE: ${score}`;
    document.getElementById('game-over').classList.remove('hidden');
}

function updateHUD() {
    document.getElementById('score').innerText = score;
    document.getElementById('best').innerText = bestScore;
    document.getElementById('lives-container').innerText = '❤'.repeat(Math.max(0, lives));
}

// Exposure to index.html
window.startGame = startGame;
window.setLevel = setLevel;
window.showLevelSelect = showLevelSelect;

gameLoop();
