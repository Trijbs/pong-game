// Game Constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 15;
const PADDLE_SPEED = 6;
const INITIAL_BALL_SPEED = 4;
const MAX_BALL_SPEED = 8;
const AI_SPEED = 5;

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
    if (e.key === 'ArrowUp') keys.arrowUp = true;
    if (e.key === 'ArrowDown') keys.arrowDown = true;
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

    // Wall collision (top and bottom)
    if (gameState.ballY <= 0) {
        gameState.ballY = 0;
        gameState.ballSpeedY = Math.abs(gameState.ballSpeedY);
    }
    if (gameState.ballY + BALL_SIZE >= GAME_HEIGHT) {
        gameState.ballY = GAME_HEIGHT - BALL_SIZE;
        gameState.ballSpeedY = -Math.abs(gameState.ballSpeedY);
    }

    // Player paddle movement (keyboard)
    if (keys.arrowUp && gameState.playerY > 0) {
        gameState.playerY -= PADDLE_SPEED;
    }
    if (keys.arrowDown && gameState.playerY + PADDLE_HEIGHT < GAME_HEIGHT) {
        gameState.playerY += PADDLE_SPEED;
    }

    // Player paddle movement (mouse)
    const playerCenter = gameState.playerY + PADDLE_HEIGHT / 2;
    if (Math.abs(keys.mouseY - playerCenter) > PADDLE_SPEED) {
        if (keys.mouseY < playerCenter) {
            if (gameState.playerY > 0) gameState.playerY -= PADDLE_SPEED;
        } else {
            if (gameState.playerY + PADDLE_HEIGHT < GAME_HEIGHT) gameState.playerY += PADDLE_SPEED;
        }
    }

    // AI paddle movement
    const aiCenter = gameState.aiY + PADDLE_HEIGHT / 2;
    const ballCenter = gameState.ballY + BALL_SIZE / 2;
    
    if (Math.abs(aiCenter - ballCenter) > AI_SPEED) {
        if (ballCenter < aiCenter) {
            if (gameState.aiY > 0) gameState.aiY -= AI_SPEED;
        } else {
            if (gameState.aiY + PADDLE_HEIGHT < GAME_HEIGHT) gameState.aiY += AI_SPEED;
        }
    }

    // Player paddle collision
    if (checkPaddleCollision(gameState.playerY, gameState.ballX, gameState.ballY, 'player')) {
        gameState.ballX = PADDLE_WIDTH + 20;
        gameState.ballSpeedX = Math.abs(gameState.ballSpeedX);
        
        // Add spin based on where ball hits paddle
        const hitPos = (gameState.ballY + BALL_SIZE / 2 - gameState.playerY) / PADDLE_HEIGHT;
        gameState.ballSpeedY = (hitPos - 0.5) * 6;
        
        // Increase ball speed slightly
        const speed = Math.sqrt(gameState.ballSpeedX ** 2 + gameState.ballSpeedY ** 2);
        if (speed < MAX_BALL_SPEED) {
            gameState.ballSpeedX = (gameState.ballSpeedX / speed) * Math.min(speed + 0.5, MAX_BALL_SPEED);
            gameState.ballSpeedY = (gameState.ballSpeedY / speed) * Math.min(speed + 0.5, MAX_BALL_SPEED);
        }
    }

    // AI paddle collision
    if (checkPaddleCollision(gameState.aiY, gameState.ballX, gameState.ballY, 'ai')) {
        gameState.ballX = GAME_WIDTH - PADDLE_WIDTH - 20 - BALL_SIZE;
        gameState.ballSpeedX = -Math.abs(gameState.ballSpeedX);
        
        // Add spin based on where ball hits paddle
        const hitPos = (gameState.ballY + BALL_SIZE / 2 - gameState.aiY) / PADDLE_HEIGHT;
        gameState.ballSpeedY = (hitPos - 0.5) * 6;
        
        // Increase ball speed slightly
        const speed = Math.sqrt(gameState.ballSpeedX ** 2 + gameState.ballSpeedY ** 2);
        if (speed < MAX_BALL_SPEED) {
            gameState.ballSpeedX = (gameState.ballSpeedX / speed) * Math.min(speed + 0.5, MAX_BALL_SPEED);
            gameState.ballSpeedY = (gameState.ballSpeedY / speed) * Math.min(speed + 0.5, MAX_BALL_SPEED);
        }
    }

    // Scoring
    if (gameState.ballX < 0) {
        gameState.aiScore++;
        resetBall();
    }
    if (gameState.ballX + BALL_SIZE > GAME_WIDTH) {
        gameState.playerScore++;
        resetBall();
    }

    updateDisplay();
}

function checkPaddleCollision(paddleY, ballX, ballY, paddle) {
    const paddleX = paddle === 'player' ? 20 : GAME_WIDTH - 20 - PADDLE_WIDTH;
    
    return (
        ballX < paddleX + PADDLE_WIDTH &&
        ballX + BALL_SIZE > paddleX &&
        ballY < paddleY + PADDLE_HEIGHT &&
        ballY + BALL_SIZE > paddleY
    );
}

function resetBall() {
    gameState.ballX = GAME_WIDTH / 2 - BALL_SIZE / 2;
    gameState.ballY = GAME_HEIGHT / 2 - BALL_SIZE / 2;
    
    const angle = (Math.random() - 0.5) * (Math.PI / 3);
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