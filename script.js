// Game Constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 15;
const PADDLE_SPEED = 8;
const BALL_SPEED = 6;
const AI_SPEED = 4;

// Game Objects
const gameContainer = document.getElementById('gameContainer');
const ball = document.getElementById('ball');
const playerPaddle = document.getElementById('playerPaddle');
const aiPaddle = document.getElementById('aiPaddle');
const playerScoreDisplay = document.getElementById('playerScore');
const aiScoreDisplay = document.getElementById('aiScore');
const resetBtn = document.getElementById('resetBtn');

// Game State
let gameState = {
    ballX: GAME_WIDTH / 2,
    ballY: GAME_HEIGHT / 2,
    ballSpeedX: BALL_SPEED,
    ballSpeedY: BALL_SPEED,
    playerY: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    aiY: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    playerScore: 0,
    aiScore: 0
};

// Input tracking - GLOBAL VARIABLES
let upPressed = false;
let downPressed = false;

// Event Listeners - DOCUMENT LEVEL for global keyboard capture
document.addEventListener('keydown', (e) => {
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
}, true); // Use capture phase for guaranteed capture

document.addEventListener('keyup', (e) => {
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
}, true); // Use capture phase for guaranteed capture

// Mouse control
gameContainer.addEventListener('mousemove', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    
    // Smooth mouse following
    const paddleCenter = gameState.playerY + PADDLE_HEIGHT / 2;
    
    if (mouseY < paddleCenter - 5) {
        gameState.playerY = Math.max(0, gameState.playerY - PADDLE_SPEED);
    } else if (mouseY > paddleCenter + 5) {
        gameState.playerY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, gameState.playerY + PADDLE_SPEED);
    }
});

resetBtn.addEventListener('click', resetGame);

// Main update function
function update() {
    // KEYBOARD CONTROLS - DIRECT VARIABLE CHECK
    if (upPressed) {
        gameState.playerY = Math.max(0, gameState.playerY - PADDLE_SPEED);
    }
    if (downPressed) {
        gameState.playerY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, gameState.playerY + PADDLE_SPEED);
    }

    // Update ball position
    gameState.ballX += gameState.ballSpeedX;
    gameState.ballY += gameState.ballSpeedY;

    // Top and bottom wall collisions
    if (gameState.ballY - BALL_SIZE / 2 <= 0 || gameState.ballY + BALL_SIZE / 2 >= GAME_HEIGHT) {
        gameState.ballSpeedY *= -1;
        gameState.ballY = Math.max(BALL_SIZE / 2, Math.min(GAME_HEIGHT - BALL_SIZE / 2, gameState.ballY));
    }

    // Player paddle collision (left side)
    const playerPaddleX = 20;
    if (checkCollision(
        gameState.ballX, gameState.ballY, BALL_SIZE,
        playerPaddleX, gameState.playerY, PADDLE_WIDTH, PADDLE_HEIGHT
    ) && gameState.ballSpeedX < 0) {
        gameState.ballSpeedX = Math.abs(gameState.ballSpeedX) * 1.05;
        gameState.ballX = playerPaddleX + PADDLE_WIDTH + BALL_SIZE / 2;
        
        // Add angle based on where ball hits paddle
        const hitPos = (gameState.ballY - (gameState.playerY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        gameState.ballSpeedY += hitPos * 3;
    }

    // AI paddle collision (right side)
    const aiPaddleX = GAME_WIDTH - 20 - PADDLE_WIDTH;
    if (checkCollision(
        gameState.ballX, gameState.ballY, BALL_SIZE,
        aiPaddleX, gameState.aiY, PADDLE_WIDTH, PADDLE_HEIGHT
    ) && gameState.ballSpeedX > 0) {
        gameState.ballSpeedX = -Math.abs(gameState.ballSpeedX) * 1.05;
        gameState.ballX = aiPaddleX - BALL_SIZE / 2;
        
        // Add angle based on where ball hits paddle
        const hitPos = (gameState.ballY - (gameState.aiY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        gameState.ballSpeedY += hitPos * 3;
    }

    // AI MOVEMENT
    const aiCenter = gameState.aiY + PADDLE_HEIGHT / 2;
    const ballCenter = gameState.ballY;
    
    if (ballCenter < aiCenter - 10) {
        gameState.aiY = Math.max(0, gameState.aiY - AI_SPEED);
    } else if (ballCenter > aiCenter + 10) {
        gameState.aiY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, gameState.aiY + AI_SPEED);
    }

    // Scoring
    if (gameState.ballX < -50) {
        gameState.aiScore++;
        resetBall();
    }
    if (gameState.ballX > GAME_WIDTH + 50) {
        gameState.playerScore++;
        resetBall();
    }

    updateDisplay();
}

function checkCollision(ballX, ballY, ballSize, paddleX, paddleY, paddleWidth, paddleHeight) {
    return ballX - ballSize / 2 < paddleX + paddleWidth &&
           ballX + ballSize / 2 > paddleX &&
           ballY - ballSize / 2 < paddleY + paddleHeight &&
           ballY + ballSize / 2 > paddleY;
}

function resetBall() {
    gameState.ballX = GAME_WIDTH / 2;
    gameState.ballY = GAME_HEIGHT / 2;
    
    const angle = (Math.random() - 0.5) * 0.5;
    const direction = Math.random() > 0.5 ? 1 : -1;
    
    gameState.ballSpeedX = direction * BALL_SPEED;
    gameState.ballSpeedY = angle * BALL_SPEED;
}

function resetGame() {
    gameState.playerScore = 0;
    gameState.aiScore = 0;
    gameState.playerY = GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    gameState.aiY = GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    resetBall();
    updateDisplay();
}

function updateDisplay() {
    ball.style.left = (gameState.ballX - BALL_SIZE / 2) + 'px';
    ball.style.top = (gameState.ballY - BALL_SIZE / 2) + 'px';
    playerPaddle.style.top = gameState.playerY + 'px';
    aiPaddle.style.top = gameState.aiY + 'px';
    playerScoreDisplay.textContent = gameState.playerScore;
    aiScoreDisplay.textContent = gameState.aiScore;
}

function gameLoop() {
    update();
    requestAnimationFrame(gameLoop);
}

// Initialize
resetBall();
updateDisplay();
gameLoop();

// Auto-focus game container on load
window.addEventListener('load', () => {
    gameContainer.focus();
});