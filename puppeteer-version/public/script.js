const socket = io();

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const controlPanel = document.getElementById('controlPanel');
const log = document.getElementById('log');

startBtn.addEventListener('click', () => {
    const config = {
        pin: document.getElementById('pin').value,
        numBots: parseInt(document.getElementById('numBots').value),
        nameTemplate: document.getElementById('nameTemplate').value,
        batchDelay: parseFloat(document.getElementById('batchDelay').value),
        enableReactions: document.getElementById('enableReactions').checked,
        reactionChoice: document.getElementById('reactionChoice').value,
        headlessMode: document.getElementById('headlessMode').checked
    };

    if (!config.pin) {
        alert('Please enter a Kahoot PIN');
        return;
    }

    socket.emit('startFlooding', config);
    startBtn.disabled = true;
    stopBtn.disabled = false;
});

stopBtn.addEventListener('click', () => {
    socket.emit('stopFlooding');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    controlPanel.style.display = 'none';
});

// Reaction buttons
document.getElementById('reactionThinking').addEventListener('click', () => socket.emit('sendReaction', 'Thinking'));
document.getElementById('reactionWow').addEventListener('click', () => socket.emit('sendReaction', 'Wow'));
document.getElementById('reactionHeart').addEventListener('click', () => socket.emit('sendReaction', 'Heart'));
document.getElementById('reactionThumbsUp').addEventListener('click', () => socket.emit('sendReaction', 'ThumbsUp'));

// Answer buttons
document.getElementById('answer0').addEventListener('click', () => socket.emit('sendAnswer', 0));
document.getElementById('answer1').addEventListener('click', () => socket.emit('sendAnswer', 1));
document.getElementById('answer2').addEventListener('click', () => socket.emit('sendAnswer', 2));
document.getElementById('answer3').addEventListener('click', () => socket.emit('sendAnswer', 3));

// Socket listeners
socket.on('log', (message) => {
    log.textContent += message + '\n';
    log.scrollTop = log.scrollHeight;
});

socket.on('botsReady', () => {
    controlPanel.style.display = 'block';
});

socket.on('floodingStopped', () => {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    controlPanel.style.display = 'none';
});
