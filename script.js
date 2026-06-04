// Canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const resolutionInfo = document.getElementById('resolutionInfo');
const playerScoreDisplay = document.getElementById('playerScore');
const aiScoreDisplay = document.getElementById('aiScore');
const resetBtn = document.getElementById('resetBtn');

// Game constants (proportional)
const PADDLE_HEIGHT_RATIO = 0.2; // 20% of canvas height
const PADDLE_WIDTH_RATIO = 0.012; // 1.2% of canvas width
const BALL_SIZE_RATIO = 0.02; // 2% of canvas height
const PADDLE_MARGIN_RATIO = 0.025; // 2.5% from edge
const PADDLE_SPEED_RATIO = 0.008; // 0.8% per frame
const BALL_SPEED_RATIO = 0.006; // 0.6% per frame
const AI_SPEED_RATIO = 0.005; // 0.5% per frame

// Game state
let gameState = {
    playerY: 0,
    aiY: 0,
    ballX: 0,
    ballY: 0,
    ballSpeedX: 0,
    ballSpeedY: 0,
    ballPrevX: 0,
    ballPrevY: 0,
    playerScore: 0,
    aiScore: 0
};

// Keyboard state
const keys = {};

// Canvas dimensions
let canvasWidth = 0;
let canvasHeight = 0;
let paddleHeight = 0;
let paddleWidth = 0;
let ballSize = 0;
let paddleMargin = 0;
let paddleSpeed = 0;
let ballSpeed = 0;
let aiSpeed = 0;

// Resize and setup canvas
function setupCanvas() {
    const container = canvas.parentElement;
    canvasWidth = container.clientWidth;
    canvasHeight = container.clientHeight - 10;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Calculate proportional sizes
    paddleHeight = canvasHeight * PADDLE_HEIGHT_RATIO;
    paddleWidth = canvasWidth * PADDLE_WIDTH_RATIO;
    ballSize = canvasHeight * BALL_SIZE_RATIO;
    paddleMargin = canvasWidth * PADDLE_MARGIN_RATIO;
    paddleSpeed = canvasHeight * PADDLE_SPEED_RATIO;
    ballSpeed = canvasHeight * BALL_SPEED_RATIO;
    aiSpeed = canvasHeight * AI_SPEED_RATIO;
    
    // Reset positions proportionally
    gameState.playerY = (canvasHeight - paddleHeight) / 2;
    gameState.aiY = (canvasHeight - paddleHeight) / 2;
    gameState.ballX = canvasWidth / 2;
    gameState.ballY = canvasHeight / 2;
    
    resolutionInfo.textContent = `${canvasWidth}x${canvasHeight}`;
}

// Initialize canvas on load
window.addEventListener('load', setupCanvas);
window.addEventListener('resize', setupCanvas);

// Keyboard listeners
window.onkeydown = function(e) {
    keys[e.code] = true;
};

window.onkeyup = function(e) {
    keys[e.code] = false;
};

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
    gameState.ballX = canvasWidth / 2;
    gameState.ballY = canvasHeight / 2;
    gameState.ballPrevX = gameState.ballX;
    gameState.ballPrevY = gameState.ballY;
    const angle = (Math.random() - 0.5) * 0.5;
    const direction = Math.random() > 0.5 ? 1 : -1;
    gameState.ballSpeedX = direction * ballSpeed;
    gameState.ballSpeedY = angle * ballSpeed;
}

// Swept collision detection
function sweptCollision(x1, y1, x2, y2, rectX, rectY, rectW, rectH) {
    // Create a swept box from previous to current position
    const minX = Math.min(x1 - ballSize / 2, x2 - ballSize / 2);
    const maxX = Math.max(x1 + ballSize / 2, x2 + ballSize / 2);
    const minY = Math.min(y1 - ballSize / 2, y2 - ballSize / 2);
    const maxY = Math.max(y1 + ballSize / 2, y2 + ballSize / 2);
    
    // Check if swept area intersects paddle
    return minX < rectX + rectW &&
           maxX > rectX &&
           minY < rectY + rectH &&
           maxY > rectY;
}

// Update game state
function update() {
    if (canvasWidth === 0) return;
    
    // Player movement
    if (keys['ArrowUp'] || keys['w'] || keys['W']) {
        gameState.playerY = Math.max(0, gameState.playerY - paddleSpeed);
    }
    if (keys['ArrowDown'] || keys['s'] || keys['S']) {
        gameState.playerY = Math.min(canvasHeight - paddleHeight, gameState.playerY + paddleSpeed);
    }
    
    // Store previous ball position
    gameState.ballPrevX = gameState.ballX;
    gameState.ballPrevY = gameState.ballY;
    
    // Update ball position
    gameState.ballX += gameState.ballSpeedX;
    gameState.ballY += gameState.ballSpeedY;
    
    // Wall collisions
    if (gameState.ballY - ballSize / 2 <= 0 || gameState.ballY + ballSize / 2 >= canvasHeight) {
        gameState.ballSpeedY = -gameState.ballSpeedY;
        gameState.ballY = Math.max(ballSize / 2, Math.min(canvasHeight - ballSize / 2, gameState.ballY));
    }
    
    // Player paddle collision (swept)
    if (sweptCollision(gameState.ballPrevX, gameState.ballPrevY, gameState.ballX, gameState.ballY,
                       paddleMargin, gameState.playerY, paddleWidth, paddleHeight) && 
        gameState.ballSpeedX < 0) {
        gameState.ballSpeedX = Math.abs(gameState.ballSpeedX) * 1.05;
        gameState.ballX = paddleMargin + paddleWidth + ballSize / 2;
        const hitPos = (gameState.ballY - (gameState.playerY + paddleHeight / 2)) / (paddleHeight / 2);
        gameState.ballSpeedY += hitPos * ballSpeed * 0.3;
    }
    
    // AI paddle collision (swept)
    const aiPaddleX = canvasWidth - paddleMargin - paddleWidth;
    if (sweptCollision(gameState.ballPrevX, gameState.ballPrevY, gameState.ballX, gameState.ballY,
                       aiPaddleX, gameState.aiY, paddleWidth, paddleHeight) && 
        gameState.ballSpeedX > 0) {
        gameState.ballSpeedX = -Math.abs(gameState.ballSpeedX) * 1.05;
        gameState.ballX = aiPaddleX - ballSize / 2;
        const hitPos = (gameState.ballY - (gameState.aiY + paddleHeight / 2)) / (paddleHeight / 2);
        gameState.ballSpeedY += hitPos * ballSpeed * 0.3;
    }
    
    // AI movement
    const aiCenter = gameState.aiY + paddleHeight / 2;
    const deadzone = paddleHeight * 0.3;
    if (gameState.ballY < aiCenter - deadzone) {
        gameState.aiY = Math.max(0, gameState.aiY - aiSpeed);
    } else if (gameState.ballY > aiCenter + deadzone) {
        gameState.aiY = Math.min(canvasHeight - paddleHeight, gameState.aiY + aiSpeed);
    }
    
    // Scoring
    if (gameState.ballX < -ballSize) {
        gameState.aiScore++;
        aiScoreDisplay.textContent = gameState.aiScore;
        resetBall();
    }
    if (gameState.ballX > canvasWidth + ballSize) {
        gameState.playerScore++;
        playerScoreDisplay.textContent = gameState.playerScore;
        resetBall();
    }
}

// Draw game
function draw() {
    if (canvasWidth === 0) return;
    
    // Clear canvas
    ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(canvasWidth / 2, 0);
    ctx.lineTo(canvasWidth / 2, canvasHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw paddles
    ctx.fillStyle = '#00d4ff';
    ctx.shadowColor = 'rgba(0, 212, 255, 0.6)';
    ctx.shadowBlur = 10;
    ctx.fillRect(paddleMargin, gameState.playerY, paddleWidth, paddleHeight);
    ctx.fillRect(canvasWidth - paddleMargin - paddleWidth, gameState.aiY, paddleWidth, paddleHeight);
    ctx.shadowColor = 'transparent';
    
    // Draw ball
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(gameState.ballX, gameState.ballY, ballSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
}

// Main game loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start
setupCanvas();
resetBall();
gameLoop();