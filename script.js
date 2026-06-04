// Game Constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 15;
const PADDLE_SPEED = 7;
const INITIAL_BALL_SPEED = 5;
const MAX_BALL_SPEED = 9;
const AI_SPEED = 3.5; // Reduced from 5 to make AI easier

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
    ballX: GAME_WIDTH / 2 - BALL_SIZE / 2,
    ballY: GAME_HEIGHT / 2 - BALL_SIZE / 2,
    ballSpeedX: INITIAL_BALL_SPEED,
    ballSpeedY: INITIAL_BALL_SPEED,
    playerY: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    aiY: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    playerScore: 0,
    aiScore: 0,
    gameRunning: true
};

// Input tracking
const keys = {
    arrowUp: false,
    arrowDown: false,
    mouseY: GAME_HEIGHT / 2
};

// Event Listeners
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        keys.arrowUp = true;
        e.preventDefault();
    }
    if (e.key === 'ArrowDown') {
        keys.arrowDown = true;
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') keys.arrowUp = false;
    if (e.key === 'ArrowDown') keys.arrowDown = false;
});

gameContainer.addEventListener('mousemove', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    keys.mouseY = e.clientY - rect.top;
});

resetBtn.addEventListener('click', resetGame);

// Game Functions
function update() {
    // Update ball position
    gameState.ballX += gameState.ballSpeedX;
    gameState.ballY += gameState.ballSpeedY;

    // Wall collision (top and bottom) - with better boundary handling
    if (gameState.ballY <= 0) {
        gameState.ballY = 0;
        gameState.ballSpeedY = Math.abs(gameState.ballSpeedY);
    }
    if (gameState.ballY + BALL_SIZE >= GAME_HEIGHT) {
        gameState.ballY = GAME_HEIGHT - BALL_SIZE;
        gameState.ballSpeedY = -Math.abs(gameState.ballSpeedY);
    }

    // Player paddle movement (keyboard) - improved responsiveness
    if (keys.arrowUp) {
        gameState.playerY = Math.max(0, gameState.playerY - PADDLE_SPEED);
    }
    if (keys.arrowDown) {
        gameState.playerY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, gameState.playerY + PADDLE_SPEED);
    }

    // Player paddle movement (mouse) - smooth following
    const playerCenter = gameState.playerY + PADDLE_HEIGHT / 2;
    const mouseDistance = keys.mouseY - playerCenter;
    
    if (Math.abs(mouseDistance) > 2) {
        if (mouseDistance < 0) {
            gameState.playerY = Math.max(0, gameState.playerY - PADDLE_SPEED);
        } else {
            gameState.playerY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, gameState.playerY + PADDLE_SPEED);
        }
    }

    // AI paddle movement - with reduced difficulty and some imperfection
    const aiCenter = gameState.aiY + PADDLE_HEIGHT / 2;
    const ballCenter = gameState.ballY + BALL_SIZE / 2;
    const aiDistance = ballCenter - aiCenter;
    
    // Add some randomness to make AI miss occasionally
    const aiImperfection = (Math.random() - 0.5) * 15;
    const targetPosition = ballCenter + aiImperfection;
    const targetDistance = targetPosition - aiCenter;
    
    if (Math.abs(targetDistance) > AI_SPEED) {
        if (targetDistance < 0) {
            gameState.aiY = Math.max(0, gameState.aiY - AI_SPEED);
        } else {
            gameState.aiY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, gameState.aiY + AI_SPEED);
        }
    }

    // Player paddle collision - improved detection
    if (gameState.ballSpeedX < 0) { // Ball moving left towards player
        const paddleX = 20;
        if (
            gameState.ballX < paddleX + PADDLE_WIDTH + 5 &&
            gameState.ballX + BALL_SIZE > paddleX - 5 &&
            gameState.ballY < gameState.playerY + PADDLE_HEIGHT &&
            gameState.ballY + BALL_SIZE > gameState.playerY
        ) {
            gameState.ballX = paddleX + PADDLE_WIDTH;
            gameState.ballSpeedX = Math.abs(gameState.ballSpeedX);
            
            // Add spin based on where ball hits paddle
            const hitPos = (gameState.ballY + BALL_SIZE / 2 - gameState.playerY) / PADDLE_HEIGHT;
            gameState.ballSpeedY = (hitPos - 0.5) * 6;
            
            // Increase ball speed slightly
            const speed = Math.sqrt(gameState.ballSpeedX ** 2 + gameState.ballSpeedY ** 2);
            if (speed < MAX_BALL_SPEED) {
                const speedIncrease = Math.min(speed + 0.3, MAX_BALL_SPEED);
                gameState.ballSpeedX = (gameState.ballSpeedX / speed) * speedIncrease;
                gameState.ballSpeedY = (gameState.ballSpeedY / speed) * speedIncrease;
            }
        }
    }

    // AI paddle collision - improved detection
    if (gameState.ballSpeedX > 0) { // Ball moving right towards AI
        const paddleX = GAME_WIDTH - 20 - PADDLE_WIDTH;
        if (
            gameState.ballX + BALL_SIZE > paddleX - 5 &&
            gameState.ballX < paddleX + PADDLE_WIDTH + 5 &&
            gameState.ballY < gameState.aiY + PADDLE_HEIGHT &&
            gameState.ballY + BALL_SIZE > gameState.aiY
        ) {
            gameState.ballX = paddleX - BALL_SIZE;
            gameState.ballSpeedX = -Math.abs(gameState.ballSpeedX);
            
            // Add spin based on where ball hits paddle
            const hitPos = (gameState.ballY + BALL_SIZE / 2 - gameState.aiY) / PADDLE_HEIGHT;
            gameState.ballSpeedY = (hitPos - 0.5) * 6;
            
            // Increase ball speed slightly
            const speed = Math.sqrt(gameState.ballSpeedX ** 2 + gameState.ballSpeedY ** 2);
            if (speed < MAX_BALL_SPEED) {
                const speedIncrease = Math.min(speed + 0.3, MAX_BALL_SPEED);
                gameState.ballSpeedX = (gameState.ballSpeedX / speed) * speedIncrease;
                gameState.ballSpeedY = (gameState.ballSpeedY / speed) * speedIncrease;
            }
        }
    }

    // Scoring - prevent ball from getting stuck
    if (gameState.ballX < -20) {
        gameState.aiScore++;
        resetBall();
    }
    if (gameState.ballX > GAME_WIDTH + 20) {
        gameState.playerScore++;
        resetBall();
    }

    updateDisplay();
}

function resetBall() {
    gameState.ballX = GAME_WIDTH / 2 - BALL_SIZE / 2;
    gameState.ballY = GAME_HEIGHT / 2 - BALL_SIZE / 2;
    
    const angle = (Math.random() - 0.5) * (Math.PI / 4);
    const direction = Math.random() > 0.5 ? 1 : -1;
    
    gameState.ballSpeedX = direction * INITIAL_BALL_SPEED * Math.cos(angle);
    gameState.ballSpeedY = INITIAL_BALL_SPEED * Math.sin(angle);
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
    // Update ball position
    ball.style.left = gameState.ballX + 'px';
    ball.style.top = gameState.ballY + 'px';

    // Update paddle positions
    playerPaddle.style.top = gameState.playerY + 'px';
    aiPaddle.style.top = gameState.aiY + 'px';

    // Update scores
    playerScoreDisplay.textContent = gameState.playerScore;
    aiScoreDisplay.textContent = gameState.aiScore;
}

// Game loop
function gameLoop() {
    if (gameState.gameRunning) {
        update();
    }
    requestAnimationFrame(gameLoop);
}

// Initialize and start game
resetBall();
updateDisplay();
gameLoop();