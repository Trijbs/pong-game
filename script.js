'use strict';

// ── Canvas ────────────────────────────────────────────────────
const canvas              = document.getElementById('gameCanvas');
const ctx                 = canvas.getContext('2d');
const resolutionInfo      = document.getElementById('resolutionInfo');
const playerScoreDisplay  = document.getElementById('playerScore');
const aiScoreDisplay      = document.getElementById('aiScore');
const highestScoreDisplay = document.getElementById('highestScore');
const resetBtn            = document.getElementById('resetBtn');
const pauseBtn            = document.getElementById('pauseBtn');
const pauseOverlay        = document.getElementById('pauseOverlay');
const muteBtn             = document.getElementById('muteBtn');

// ── Constants ─────────────────────────────────────────────────
const W           = 800;
const H           = 400;
const PH          = 80;   // player paddle height (fixed)
const PW          = 10;   // paddle width
const PMARG       = 20;   // paddle margin from edge
const PSPD        = 6;    // player paddle speed
const BR          = 7.5;  // ball radius
const INIT_SPD    = 5;
const MAX_SPD     = 12;
const TRAIL_MIN   = 3;
const TRAIL_MAX   = 8;

// ── Difficulty configs ────────────────────────────────────────
const DIFFS = {
    easy: {
        speed:        2.5,
        deadzone:     36,    // px from paddle center before reacting
        errorRate:    0.07,  // chance per frame to introduce drift
        errorMag:     22,    // max drift magnitude in px
        predict:      false,
        reactDist:    220,   // only reacts when ball is this close (px from AI side)
        paddleH:      80,
    },
    medium: {
        speed:        4.0,
        deadzone:     22,
        errorRate:    0.03,
        errorMag:     10,
        predict:      false,
        reactDist:    W,
        paddleH:      80,
    },
    hard: {
        speed:        5.5,
        deadzone:     8,
        errorRate:    0.012,
        errorMag:     4,
        predict:      true,
        reactDist:    W,
        paddleH:      80,
    },
    insane: {
        speed:        6.8,
        deadzone:     3,
        errorRate:    0.003,
        errorMag:     1.5,
        predict:      true,
        reactDist:    W,
        paddleH:      60,   // smaller paddle — compensates for near-perfect accuracy
    },
};

// ── Game state ────────────────────────────────────────────────
let difficulty = 'medium';
let isPaused   = false;
let isMuted    = false;

let gs = {
    playerY:    H / 2 - PH / 2,
    aiY:        H / 2 - PH / 2,
    ballX:      W / 2,
    ballY:      H / 2,
    ballVX:     INIT_SPD,
    ballVY:     0,
    ballPrevX:  W / 2,
    ballPrevY:  H / 2,
    playerScore: 0,
    aiScore:     0,
};

let ballSpd  = INIT_SPD;   // magnitude — tracked separately for color/trail
let aiErr    = 0;          // accumulated AI drift
let trail    = [];
let particles = [];
let shake    = { x: 0, y: 0, frames: 0, intensity: 0 };

// ── High score ────────────────────────────────────────────────
let highScore = parseInt(localStorage.getItem('pongHighScore') || '0');
highestScoreDisplay.textContent = highScore;

// ── Web Audio ─────────────────────────────────────────────────
let audioCtx = null;

function getAC() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function tone(freq, dur, vol = 0.25, type = 'sine', freqEnd = null) {
    if (isMuted) return;
    try {
        const ac  = getAC();
        const osc = ac.createOscillator();
        const gn  = ac.createGain();
        osc.connect(gn);
        gn.connect(ac.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ac.currentTime);
        if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime + dur);
        gn.gain.setValueAtTime(vol, ac.currentTime);
        gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + dur + 0.02);
    } catch(e) {}
}

const sfx = {
    hit:   () => tone(220, 0.06, 0.22),
    wall:  () => tone(330, 0.04, 0.13),
    score: () => tone(440, 0.28, 0.28, 'sine', 220),
    over:  () => {
        tone(262, 0.35, 0.18);
        setTimeout(() => tone(330, 0.35, 0.18), 120);
        setTimeout(() => tone(392, 0.50, 0.22), 240);
    },
};

// ── Input ─────────────────────────────────────────────────────
let upP = false, dnP = false;

window.addEventListener('keydown', (e) => {
    // Resume audio context on any key
    if (audioCtx) audioCtx.resume();

    if (e.key === 'ArrowUp'   || e.key.toLowerCase() === 'w') { upP = true; e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { dnP = true; e.preventDefault(); }
    if (e.key === ' ')                  { togglePause();  e.preventDefault(); }
    if (e.key.toLowerCase() === 'm')   { toggleMute(); }
}, true);

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp'   || e.key.toLowerCase() === 'w') upP = false;
    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') dnP = false;
}, true);

// ── Pause / mute ──────────────────────────────────────────────
function togglePause() {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    pauseOverlay.classList.toggle('active', isPaused);
}

function toggleMute() {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
}

pauseBtn.addEventListener('click', togglePause);
muteBtn.addEventListener('click', () => { toggleMute(); audioCtx && audioCtx.resume(); });

// ── Difficulty buttons ────────────────────────────────────────
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        difficulty = btn.dataset.diff;
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// ── Reset ─────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
    gs.playerScore = 0;
    gs.aiScore     = 0;
    playerScoreDisplay.textContent = '0';
    aiScoreDisplay.textContent     = '0';
    particles = [];
    trail     = [];
    resetBall();
    if (isPaused) togglePause();
});

// ── Ball reset ────────────────────────────────────────────────
function resetBall() {
    gs.ballX     = W / 2;
    gs.ballY     = H / 2;
    gs.ballPrevX = gs.ballX;
    gs.ballPrevY = gs.ballY;

    const angle = (Math.random() - 0.5) * 0.5;
    const dir   = Math.random() > 0.5 ? 1 : -1;
    gs.ballVX   = dir * INIT_SPD * Math.cos(angle);
    gs.ballVY   = INIT_SPD * Math.sin(angle);
    ballSpd     = INIT_SPD;
    trail       = [];
    aiErr       = 0;
}

// ── Trajectory prediction (Hard / Insane) ────────────────────
function predictY(bx, by, vx, vy, targetX) {
    if (vx <= 0) return by;
    let x = bx, y = by;
    for (let i = 0; i < 350 && x < targetX; i++) {
        x += vx; y += vy;
        if (y - BR <= 0)  { vy =  Math.abs(vy); y = BR; }
        if (y + BR >= H)  { vy = -Math.abs(vy); y = H - BR; }
    }
    return y;
}

// ── AI update ─────────────────────────────────────────────────
function updateAI() {
    const cfg      = DIFFS[difficulty];
    const aiH      = cfg.paddleH;
    const aiPaddleX = W - PMARG - PW;
    const distFromAI = W - PMARG - gs.ballX;

    // Easy AI drifts toward center when ball is far away
    if (distFromAI > cfg.reactDist) {
        if (difficulty === 'easy') {
            const center = H / 2 - aiH / 2;
            gs.aiY += (center - gs.aiY) * 0.025;
        }
        return;
    }

    // Determine target Y
    let targetY;
    if (cfg.predict && gs.ballVX > 0) {
        targetY = predictY(gs.ballX, gs.ballY, gs.ballVX, gs.ballVY, aiPaddleX) - aiH / 2;
    } else {
        targetY = gs.ballY - aiH / 2;
    }

    // Inject random drift error
    if (Math.random() < cfg.errorRate) aiErr = (Math.random() * 2 - 1) * cfg.errorMag;
    aiErr *= 0.94;
    targetY += aiErr;

    // Move toward target with deadzone
    const aiCenter  = gs.aiY + aiH / 2;
    const tgtCenter = targetY + aiH / 2;
    const diff      = tgtCenter - aiCenter;

    if (Math.abs(diff) > cfg.deadzone) {
        gs.aiY += diff > 0 ? cfg.speed : -cfg.speed;
    }

    gs.aiY = Math.max(0, Math.min(H - aiH, gs.aiY));
}

// ── Ball color (speed → teal → amber → red) ───────────────────
function ballColor(spd) {
    const t = Math.max(0, Math.min(1, (spd - INIT_SPD) / (MAX_SPD - INIT_SPD)));
    let r, g, b;
    if (t < 0.5) {
        const s = t * 2;                      // 0→1
        r = Math.round(s * 255);             // 0   → 255
        g = Math.round(212 - s * 42);        // 212 → 170
        b = Math.round(255 - s * 255);       // 255 → 0
    } else {
        const s = (t - 0.5) * 2;             // 0→1
        r = 255;
        g = Math.round(170 - s * 122);       // 170 → 48
        b = Math.round(s * 48);              // 0   → 48
    }
    return `rgb(${r},${g},${b})`;
}

// ── Particles ─────────────────────────────────────────────────
function spawnHit(x, y, col) {
    for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 1.5 + Math.random() * 3.5;
        particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
            life: 18 + Math.random()*10, max: 28, col, sz: 1.5 + Math.random()*2 });
    }
}

function spawnScore(side) {
    const x = side === 'player' ? PMARG + PW + 25 : W - PMARG - PW - 25;
    for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 5;
        particles.push({ x, y: H/2 + (Math.random()-0.5)*50,
            vx: Math.cos(a)*s, vy: Math.sin(a)*s - 1.5,
            life: 38 + Math.random()*22, max: 60, col: '#ffd700', sz: 2.5 + Math.random()*3 });
    }
}

function updateParticles() {
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.12;
        p.vx *= 0.96;
        p.life--;
    });
}

function drawParticles() {
    particles.forEach(p => {
        const a = (p.life / p.max) * 0.88;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle   = p.col;
        ctx.shadowColor = p.col;
        ctx.shadowBlur  = 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.sz * (p.life / p.max)), 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    });
}

// ── Screen shake ──────────────────────────────────────────────
function triggerShake(intensity) {
    shake.intensity = intensity;
    shake.frames    = 18;
}

function updateShake() {
    if (shake.frames > 0) {
        shake.frames--;
        const d  = shake.frames / 18;
        shake.x  = (Math.random()*2 - 1) * shake.intensity * d;
        shake.y  = (Math.random()*2 - 1) * shake.intensity * d;
    } else {
        shake.x = shake.y = 0;
    }
}

// ── High score update ─────────────────────────────────────────
function updateHighScore() {
    const best = Math.max(gs.playerScore, gs.aiScore);
    if (best > highScore) {
        highScore = best;
        localStorage.setItem('pongHighScore', highScore);
        highestScoreDisplay.textContent = highScore;
    }
}

// ── Swept AABB collision ──────────────────────────────────────
function swept(x1, y1, x2, y2, rx, ry, rw, rh) {
    const minX = Math.min(x1-BR, x2-BR), maxX = Math.max(x1+BR, x2+BR);
    const minY = Math.min(y1-BR, y2-BR), maxY = Math.max(y1+BR, y2+BR);
    return minX < rx+rw && maxX > rx && minY < ry+rh && maxY > ry;
}

// ── Update ────────────────────────────────────────────────────
function update() {
    // Player paddle
    if (upP) gs.playerY = Math.max(0,      gs.playerY - PSPD);
    if (dnP) gs.playerY = Math.min(H - PH, gs.playerY + PSPD);

    // Ball prev position
    gs.ballPrevX = gs.ballX;
    gs.ballPrevY = gs.ballY;

    // Move ball
    gs.ballX += gs.ballVX;
    gs.ballY += gs.ballVY;

    // Wall bounce
    if (gs.ballY - BR <= 0) {
        gs.ballVY = Math.abs(gs.ballVY);
        gs.ballY  = BR;
        sfx.wall();
        spawnHit(gs.ballX, BR, '#00d4ff');
    }
    if (gs.ballY + BR >= H) {
        gs.ballVY = -Math.abs(gs.ballVY);
        gs.ballY  = H - BR;
        sfx.wall();
        spawnHit(gs.ballX, H - BR, '#00d4ff');
    }

    // Player paddle collision
    if (gs.ballVX < 0 &&
        swept(gs.ballPrevX, gs.ballPrevY, gs.ballX, gs.ballY,
              PMARG, gs.playerY, PW, PH)) {

        ballSpd = Math.min(ballSpd * 1.05 + 0.3, MAX_SPD);
        const hitPos = (gs.ballY - (gs.playerY + PH/2)) / (PH/2);
        const angle  = hitPos * (Math.PI / 3.5);
        gs.ballVX    = ballSpd * Math.cos(angle);
        gs.ballVY    = ballSpd * Math.sin(angle);
        gs.ballX     = PMARG + PW + BR + 1;

        sfx.hit();
        spawnHit(PMARG + PW, gs.ballY, ballColor(ballSpd));
    }

    // AI paddle collision
    const aiH = DIFFS[difficulty].paddleH;
    const aiX = W - PMARG - PW;
    if (gs.ballVX > 0 &&
        swept(gs.ballPrevX, gs.ballPrevY, gs.ballX, gs.ballY,
              aiX, gs.aiY, PW, aiH)) {

        ballSpd = Math.min(ballSpd * 1.05 + 0.3, MAX_SPD);
        const hitPos = (gs.ballY - (gs.aiY + aiH/2)) / (aiH/2);
        const angle  = hitPos * (Math.PI / 3.5);
        gs.ballVX    = -ballSpd * Math.cos(angle);
        gs.ballVY    =  ballSpd * Math.sin(angle);
        gs.ballX     = aiX - BR - 1;

        sfx.hit();
        spawnHit(aiX, gs.ballY, ballColor(ballSpd));
    }

    // AI movement
    updateAI();

    // Ball trail (length scales with speed)
    trail.push({ x: gs.ballX, y: gs.ballY });
    const trailLen = Math.round(TRAIL_MIN + (ballSpd - INIT_SPD) / (MAX_SPD - INIT_SPD) * (TRAIL_MAX - TRAIL_MIN));
    while (trail.length > trailLen) trail.shift();

    // Effects
    updateParticles();
    updateShake();

    // Scoring
    if (gs.ballX < -BR * 2) {
        gs.aiScore++;
        aiScoreDisplay.textContent = gs.aiScore;
        sfx.score();
        spawnScore('ai');
        triggerShake(3 + ballSpd * 0.35);
        updateHighScore();
        resetBall();
    }
    if (gs.ballX > W + BR * 2) {
        gs.playerScore++;
        playerScoreDisplay.textContent = gs.playerScore;
        sfx.score();
        spawnScore('player');
        triggerShake(3 + ballSpd * 0.35);
        updateHighScore();
        resetBall();
    }
}

// ── Draw ──────────────────────────────────────────────────────
function draw() {
    ctx.save();
    ctx.translate(Math.round(shake.x), Math.round(shake.y));

    // Background
    ctx.fillStyle = '#0d0d23';
    ctx.fillRect(-6, -6, W + 12, H + 12);

    // Center dashed line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Ball trail
    const bCol = ballColor(ballSpd);
    for (let i = 0; i < trail.length; i++) {
        const t = (i + 1) / (trail.length + 1);
        ctx.save();
        ctx.globalAlpha = t * 0.32;
        ctx.fillStyle   = bCol;
        ctx.shadowColor = bCol;
        ctx.shadowBlur  = 5;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, BR * t * 0.88, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }

    // Ball
    const glowSize = 14 + (ballSpd - INIT_SPD) * 1.8;
    ctx.save();
    ctx.fillStyle   = bCol;
    ctx.shadowColor = bCol;
    ctx.shadowBlur  = glowSize;
    ctx.beginPath();
    ctx.arc(gs.ballX, gs.ballY, BR, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Player paddle
    ctx.save();
    ctx.fillStyle   = '#00d4ff';
    ctx.shadowColor = 'rgba(0,212,255,0.65)';
    ctx.shadowBlur  = 12;
    ctx.fillRect(PMARG, gs.playerY, PW, PH);
    ctx.restore();

    // AI paddle — red tint for Insane, normal otherwise
    const aiH    = DIFFS[difficulty].paddleH;
    const aiCol  = difficulty === 'insane' ? '#ff6060' : '#00d4ff';
    const aiGlow = difficulty === 'insane' ? 'rgba(255,96,96,0.6)' : 'rgba(0,212,255,0.65)';
    ctx.save();
    ctx.fillStyle   = aiCol;
    ctx.shadowColor = aiGlow;
    ctx.shadowBlur  = 12;
    ctx.fillRect(W - PMARG - PW, gs.aiY, PW, aiH);
    ctx.restore();

    // Particles
    drawParticles();

    // Resolution
    resolutionInfo.textContent = `${W}x${H}`;

    ctx.restore(); // end shake
}

// ── Game loop ─────────────────────────────────────────────────
function loop() {
    if (!isPaused) update();
    draw();
    requestAnimationFrame(loop);
}

resetBall();
loop();
