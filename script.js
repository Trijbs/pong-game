// Canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const resolutionInfo = document.getElementById('resolutionInfo');
const playerScoreDisplay = document.getElementById('playerScore');
const aiScoreDisplay = document.getElementById('aiScore');
const resetBtn = document.getElementById('resetBtn');

// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 10;
const BALL_SIZE = 15;
const PADDLE_MARGIN = 20;
const PADDLE_SPEED = 6;
const BALL_SPEED = 5;
const AI_SPEED = 4;

// Game state
let gameState = {
    playerY: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    aiY: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    ballX: CANVAS_WIDTH / 2,
    ballY: CANVAS_HEIGHT / 2,
    ballSpeedX: BALL_SPEED,
    ballSpeedY: BALL_SPEED,
    ballPrevX: CANVAS_WIDTH / 2,
    ballPrevY: CANVAS_HEIGHT / 2,
    playerScore: 0,
    aiScore: 0
};

// Keyboard state
let upPressed = false;
let downPressed = false;

// Keyboard listeners - PREVENT DEFAULT for arrow keys
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        upPressed = true;
        e.preventDefault();
    }
    if (e.key === 'ArrowDown') {
        downPressed = true;
        e.preventDefault();
    }
    if (e.key.toLowerCase() === 'w') {
        upPressed = true;
        e.preventDefault();
    }
    if (e.key.toLowerCase() === 's') {
        downPressed = true;
        e.preventDefault();
    }
}, true);

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') {
        upPressed = false;
    }
    if (e.key === 'ArrowDown') {
        downPressed = false;
    }
    if (e.key.toLowerCase() === 'w') {
        upPressed = false;
    }
    if (e.key.toLowerCase() === 's') {
        downPressed = false;
    }
}, true);

// Reset button
resetBtn.addEventListener('click', () => {
    gameState.playerScore = 0;
    gameState.aiScore = 0;
    playerScoreDisplay.textContent = '0';
    aiScoreDisplay.textContent = '0';
    resetBall();
});

// Reset ball
function resetBall() {
    gameState.ballX = CANVAS_WIDTH / 2;
    gameState.ballY = CANVAS_HEIGHT / 2;
    gameState.ballPrevX = gameState.ballX;
    gameState.ballPrevY = gameState.ballY;
    const angle = (Math.random() - 0.5) * 0.5;
    const direction = Math.random() > 0.5 ? 1 : -1;
    gameState.ballSpeedX = direction * BALL_SPEED;
    gameState.ballSpeedY = angle * BALL_SPEED;
}

// Swept collision detection
function sweptCollision(x1, y1, x2, y2, rectX, rectY, rectW, rectH) {
    // Create a swept box from previous to current position
    const minX = Math.min(x1 - BALL_SIZE / 2, x2 - BALL_SIZE / 2);
    const maxX = Math.max(x1 + BALL_SIZE / 2, x2 + BALL_SIZE / 2);
    const minY = Math.min(y1 - BALL_SIZE / 2, y2 - BALL_SIZE / 2);
    const maxY = Math.max(y1 + BALL_SIZE / 2, y2 + BALL_SIZE / 2);
    
    // Check if swept area intersects paddle
    return minX < rectX + rectW &&
           maxX > rectX &&
           minY < rectY + rectH &&
           maxY > rectY;
}

// Update game state
function update() {
    // Player movement - DIRECT KEYBOARD CHECK
    if (upPressed) {
        gameState.playerY = Math.max(0, gameState.playerY - PADDLE_SPEED);
    }
    if (downPressed) {
        gameState.playerY = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, gameState.playerY + PADDLE_SPEED);
    }
    
    // Store previous ball position
    gameState.ballPrevX = gameState.ballX;
    gameState.ballPrevY = gameState.ballY;
    
    // Update ball position
    gameState.ballX += gameState.ballSpeedX;
    gameState.ballY += gameState.ballSpeedY;
    
    // Wall collisions
    if (gameState.ballY - BALL_SIZE / 2 <= 0 || gameState.ballY + BALL_SIZE / 2 >= CANVAS_HEIGHT) {
        gameState.ballSpeedY = -gameState.ballSpeedY;
        gameState.ballY = Math.max(BALL_SIZE / 2, Math.min(CANVAS_HEIGHT - BALL_SIZE / 2, gameState.ballY));
    }
    
    // Player paddle collision (swept)
    if (sweptCollision(gameState.ballPrevX, gameState.ballPrevY, gameState.ballX, gameState.ballY,
                       PADDLE_MARGIN, gameState.playerY, PADDLE_WIDTH, PADDLE_HEIGHT) && 
        gameState.ballSpeedX < 0) {
        gameState.ballSpeedX = Math.abs(gameState.ballSpeedX) * 1.05;
        gameState.ballX = PADDLE_MARGIN + PADDLE_WIDTH + BALL_SIZE / 2;
        const hitPos = (gameState.ballY - (gameState.playerY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        gameState.ballSpeedY += hitPos * 3;
    }
    
    // AI paddle collision (swept)
    const aiPaddleX = CANVAS_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH;
    if (sweptCollision(gameState.ballPrevX, gameState.ballPrevY, gameState.ballX, gameState.ballY,
                       aiPaddleX, gameState.aiY, PADDLE_WIDTH, PADDLE_HEIGHT) && 
        gameState.ballSpeedX > 0) {
        gameState.ballSpeedX = -Math.abs(gameState.ballSpeedX) * 1.05;
        gameState.ballX = aiPaddleX - BALL_SIZE / 2;
        const hitPos = (gameState.ballY - (gameState.aiY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        gameState.ballSpeedY += hitPos * 3;
    }
    
    // AI movement
    const aiCenter = gameState.aiY + PADDLE_HEIGHT / 2;
    const deadzone = PADDLE_HEIGHT * 0.3;
    if (gameState.ballY < aiCenter - deadzone) {
        gameState.aiY = Math.max(0, gameState.aiY - AI_SPEED);
    } else if (gameState.ballY > aiCenter + deadzone) {
        gameState.aiY = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, gameState.aiY + AI_SPEED);
    }
    
    // Scoring
    if (gameState.ballX < -BALL_SIZE) {
        gameState.aiScore++;
        aiScoreDisplay.textContent = gameState.aiScore;
        resetBall();
    }
    if (gameState.ballX > CANVAS_WIDTH + BALL_SIZE) {
        gameState.playerScore++;
        playerScoreDisplay.textContent = gameState.playerScore;
        resetBall();
    }
}

// Draw game
function draw() {
    // Clear canvas
    ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw paddles
    ctx.fillStyle = '#00d4ff';
    ctx.shadowColor = 'rgba(0, 212, 255, 0.6)';
    ctx.shadowBlur = 10;
    ctx.fillRect(PADDLE_MARGIN, gameState.playerY, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.fillRect(CANVAS_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH, gameState.aiY, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.shadowColor = 'transparent';
    
    // Draw ball
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(gameState.ballX, gameState.ballY, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    
    // Update resolution info
    resolutionInfo.textContent = `${CANVAS_WIDTH}x${CANVAS_HEIGHT}`;
}

// Main game loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start
resetBall();
gameLoop();