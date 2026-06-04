// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 10;
const BALL_SIZE = 15;
const PADDLE_SPEED = 8;

// Get elements
const ball = document.getElementById('ball');
const playerPaddle = document.getElementById('playerPaddle');
const aiPaddle = document.getElementById('aiPaddle');
const playerScoreDisplay = document.getElementById('playerScore');
const aiScoreDisplay = document.getElementById('aiScore');

// Game variables
let playerY = GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2;
let aiY = GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2;
let ballX = GAME_WIDTH / 2;
let ballY = GAME_HEIGHT / 2;
let ballSpeedX = 5;
let ballSpeedY = 5;
let playerScore = 0;
let aiScore = 0;

// Keyboard state
const keys = {};

// Listen for key presses - SIMPLE AND DIRECT
window.onkeydown = function(e) {
    keys[e.code] = true;
};

window.onkeyup = function(e) {
    keys[e.code] = false;
};

// Main game loop
function gameLoop() {
    // PLAYER MOVEMENT - CHECK ARROW KEYS EVERY FRAME
    if (keys['ArrowUp'] && playerY > 0) {
        playerY -= PADDLE_SPEED;
    }
    if (keys['ArrowDown'] && playerY < GAME_HEIGHT - PADDLE_HEIGHT) {
        playerY += PADDLE_SPEED;
    }

    // Update ball position
    ballX += ballSpeedX;
    ballY += ballSpeedY;

    // Ball collision with top/bottom walls
    if (ballY - BALL_SIZE / 2 <= 0 || ballY + BALL_SIZE / 2 >= GAME_HEIGHT) {
        ballSpeedY = -ballSpeedY;
    }

    // Ball collision with left paddle (player)
    if (ballX - BALL_SIZE / 2 <= 20 + PADDLE_WIDTH &&
        ballY >= playerY &&
        ballY <= playerY + PADDLE_HEIGHT &&
        ballSpeedX < 0) {
        ballSpeedX = -ballSpeedX;
        ballX = 20 + PADDLE_WIDTH + BALL_SIZE / 2;
        
        // Add spin
        const deltaY = ballY - (playerY + PADDLE_HEIGHT / 2);
        ballSpeedY += deltaY * 0.1;
    }

    // Ball collision with right paddle (AI)
    if (ballX + BALL_SIZE / 2 >= GAME_WIDTH - 20 - PADDLE_WIDTH &&
        ballY >= aiY &&
        ballY <= aiY + PADDLE_HEIGHT &&
        ballSpeedX > 0) {
        ballSpeedX = -ballSpeedX;
        ballX = GAME_WIDTH - 20 - PADDLE_WIDTH - BALL_SIZE / 2;
        
        // Add spin
        const deltaY = ballY - (aiY + PADDLE_HEIGHT / 2);
        ballSpeedY += deltaY * 0.1;
    }

    // AI movement - simple
    const aiCenter = aiY + PADDLE_HEIGHT / 2;
    if (ballY < aiCenter - 35) {
        aiY -= 4;
    } else if (ballY > aiCenter + 35) {
        aiY += 4;
    }
    aiY = Math.max(0, Math.min(GAME_HEIGHT - PADDLE_HEIGHT, aiY));

    // Scoring
    if (ballX < 0) {
        aiScore++;
        resetBall();
    }
    if (ballX > GAME_WIDTH) {
        playerScore++;
        resetBall();
    }

    // Update display
    playerPaddle.style.top = playerY + 'px';
    aiPaddle.style.top = aiY + 'px';
    ball.style.left = ballX + 'px';
    ball.style.top = ballY + 'px';
    playerScoreDisplay.textContent = playerScore;
    aiScoreDisplay.textContent = aiScore;

    requestAnimationFrame(gameLoop);
}

function resetBall() {
    ballX = GAME_WIDTH / 2;
    ballY = GAME_HEIGHT / 2;
    ballSpeedX = (Math.random() > 0.5 ? 1 : -1) * 5;
    ballSpeedY = (Math.random() - 0.5) * 5;
}

// Start game
gameLoop();