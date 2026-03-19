/**
 * Gesture Fruit Slicer - Web Optimized Engine
 * Multi-segment collision + Zero-latency feel
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const videoElement = document.getElementById('input-video');

// Configs
const WIDTH = 1280;
const HEIGHT = 720;
canvas.width = WIDTH;
canvas.height = HEIGHT;

const STATE_MENU = 0;
const STATE_LEVEL_SELECT = 1;
const STATE_PLAYING = 2;
const STATE_GAMEOVER = 3;

let gameState = STATE_MENU;
let score = 0;
let bestScore = localStorage.getItem('slicer_best') || 0;
let lives = 5;
let difficulty = 1; // 0: Easy, 1: Medium, 2: Hard

const LEVEL_CONFIGS = [
    { name: "EASY", gravity: 0.15, spawnRate: 0.015, velThreshold: 15, bombRate: 0.003 },
    { name: "MEDIUM", gravity: 0.25, spawnRate: 0.03, velThreshold: 22, bombRate: 0.006 },
    { name: "HARD", gravity: 0.38, spawnRate: 0.045, velThreshold: 30, bombRate: 0.012 }
];

// Entities
let fruits = [];
let bombs = [];
let particles = [];
let trail = []; // Array of [{x, y}, ...]
const TRAIL_MAX = 8; // Multi-point collision history

// --- MediaPipe Setup ---
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

let currentHand = null;

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        // Index finger tip is landmark 8
        currentHand = {
            x: (1 - landmarks[8].x) * WIDTH, // Mirror x
            y: landmarks[8].y * HEIGHT
        };
    } else {
        currentHand = null;
    }
    
    // Remove loading screen once we get results
    document.getElementById('loading').classList.add('hidden');
});

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});
camera.start();

// --- Classes ---

class Fruit {
    constructor(gravity) {
        this.radius = 35;
        this.x = Math.random() * (WIDTH - 100) + 50;
        this.y = HEIGHT + 20;
        this.velX = (Math.random() - 0.5) * 8;
        this.velY = -(Math.random() * 8 + 14);
        this.gravity = gravity;
        this.color = `hsl(${Math.random() * 360}, 70%, 60%)`;
        this.isSliced = false;
        this.sliceAngle = 0;
    }

    update() {
        this.x += this.velX;
        this.y += this.velY;
        this.velY += this.gravity;
    }

    draw(ctx) {
        if (!this.isSliced) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.color;
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            // Draw half slices
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.sliceAngle);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, -5, this.radius, Math.PI, 0); // Upper half
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, 15, this.radius, 0, Math.PI); // Lower half
            ctx.fill();
            ctx.restore();
        }
    }
}

class Bomb {
    constructor(gravity) {
        this.radius = 40;
        this.x = Math.random() * (WIDTH - 100) + 50;
        this.y = HEIGHT + 20;
        this.velX = (Math.random() - 0.5) * 6;
        this.velY = -(Math.random() * 10 + 12);
        this.gravity = gravity * 0.8;
    }

    update() {
        this.x += this.velX;
        this.y += this.velY;
        this.velY += this.gravity;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#111';
        ctx.fill();
        ctx.strokeStyle = '#f50';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.velX = (Math.random() - 0.5) * 10;
        this.velY = (Math.random() - 0.5) * 10;
        this.life = 1.0;
        this.color = color;
    }

    update() {
        this.x += this.velX;
        this.y += this.velY;
        this.life -= 0.03;
    }

    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - 4, this.y - 4, 8, 8);
        ctx.globalAlpha = 1;
    }
}

// --- Systems ---

function checkCollisions() {
    if (trail.length < 2) return;

    const config = LEVEL_CONFIGS[difficulty];
    
    // Check segments in trail (Last 8 points)
    for (let i = 0; i < trail.length - 1; i++) {
        const p1 = trail[i];
        const p2 = trail[i + 1];
        
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (dist < 5) continue; // Noise filter

        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        // Check fruits
        fruits.forEach(f => {
            if (!f.isSliced) {
                if (lineCircleIntersect(p1, p2, f, f.radius + 35)) {
                    f.isSliced = true;
                    f.sliceAngle = angle;
                    score += 10;
                    if (score > bestScore) {
                        bestScore = score;
                        localStorage.setItem('slicer_best', bestScore);
                    }
                    for (let j = 0; j < 8; j++) particles.push(new Particle(f.x, f.y, f.color));
                }
            }
        });

        // Check bombs
        bombs.forEach((b, idx) => {
            if (lineCircleIntersect(p1, p2, b, b.radius + 15)) {
                lives--;
                bombs.splice(idx, 1);
                if (lives <= 0) endGame();
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

    let discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return false;

    discriminant = Math.sqrt(discriminant);
    const t1 = (-b - discriminant) / (2 * a);
    const t2 = (-b + discriminant) / (2 * a);

    return (Math.max(0, t1) <= Math.min(1, t2));
}

// --- Loop ---

function gameLoop() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // 1. Draw Dojo Background
    ctx.fillStyle = '#2c1e14';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = '#3c2e24';
    for (let i = 0; i < WIDTH; i += 120) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, HEIGHT);
        ctx.stroke();
    }

    if (gameState === STATE_PLAYING) {
        // Spawn
        const config = LEVEL_CONFIGS[difficulty];
        if (Math.random() < config.spawnRate + (score / 5000)) fruits.push(new Fruit(config.gravity));
        if (Math.random() < config.bombRate) bombs.push(new Bomb(config.gravity));

        // Update & Draw
        fruits.forEach((f, i) => {
            f.update();
            f.draw(ctx);
            if (f.y > HEIGHT + 100) {
                if (!f.isSliced) lives--;
                fruits.splice(i, 1);
            }
        });

        bombs.forEach((b, i) => {
            b.update();
            b.draw(ctx);
            if (b.y > HEIGHT + 100) bombs.splice(i, 1);
        });

        particles.forEach((p, i) => {
            p.update();
            p.draw(ctx);
            if (p.life <= 0) particles.splice(i, 1);
        });

        // Trail & Collision
        if (currentHand) {
            trail.push(currentHand);
            if (trail.length > TRAIL_MAX) trail.shift();
            checkCollisions();
        } else {
            trail = [];
        }

        // Draw Trail
        if (trail.length > 2) {
            ctx.beginPath();
            ctx.lineCap = 'round';
            for (let i = 0; i < trail.length - 1; i++) {
                const alpha = i / trail.length;
                ctx.strokeStyle = `rgba(255, 200, 50, ${alpha})`;
                ctx.lineWidth = i * 2;
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

// --- UI Actions ---

function startGame() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('level-select').classList.remove('hidden');
}

function setLevel(lvl) {
    difficulty = lvl;
    score = 0;
    lives = 5;
    fruits = [];
    bombs = [];
    particles = [];
    gameState = STATE_PLAYING;
    document.getElementById('level-select').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
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

// Start visual loop
gameLoop();
