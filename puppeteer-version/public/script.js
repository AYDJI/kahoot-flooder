const socket = io();

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const controlPanel = document.getElementById('controlPanel');
const log = document.getElementById('log');
const statusIndicator = document.getElementById('statusIndicator');

// AI provider toggle
document.getElementById('aiProvider').addEventListener('change', function() {
    const provider = this.value;
    document.getElementById('apiKeyGroup').style.display = (provider === 'gemini' || provider === 'openrouter') ? 'block' : 'none';
    document.getElementById('ollamaModelGroup').style.display = provider === 'ollama' ? 'block' : 'none';
    document.getElementById('openRouterModelGroup').style.display = provider === 'openrouter' ? 'block' : 'none';
});

 // Initialize UI behaviors
const useCustomNamesCheckbox = document.getElementById('useCustomNames');
const botNamesGroup = document.getElementById('botNamesGroup');

function toggleNamesGroup() {
    botNamesGroup.style.display = useCustomNamesCheckbox.checked ? 'block' : 'none';
}

function updateStatus(status, text) {
    statusIndicator.className = `status-indicator ${status}`;
    statusIndicator.innerHTML = `
        <span class="status-dot"></span>
        <span>${text}</span>
    `;
}

useCustomNamesCheckbox.addEventListener('change', toggleNamesGroup);

// Set initial visibility
toggleNamesGroup();

 startBtn.addEventListener('click', () => {
    const rawNames = document.getElementById('botNames').value;
    const botNames = rawNames
        ? rawNames.split(/\r?\n|,/).map(n => n.trim()).filter(n => n.length > 0)
        : [];

    const useCustomNamesVal = useCustomNamesCheckbox.checked;
    const config = {
        pin: document.getElementById('pin').value,
        numBots: parseInt(document.getElementById('numBots').value),
        nameTemplate: document.getElementById('nameTemplate').value,
        batchDelay: parseFloat(document.getElementById('batchDelay').value),
        enableReactions: document.getElementById('enableReactions').checked,
        reactionChoice: document.getElementById('reactionChoice').value,
        headlessMode: document.getElementById('headlessMode').checked,
        enableAI: document.getElementById('enableAI').checked,
        aiProvider: document.getElementById('aiProvider').value,
        apiKey: document.getElementById('apiKey').value,
        ollamaModel: document.getElementById('ollamaModel').value,
        openRouterModel: document.getElementById('openRouterModel').value,
        useCustomNames: useCustomNamesVal,
        botNames: botNames
    };

    if (!config.pin) {
        alert('Please enter a Kahoot PIN');
        return;
    }

    socket.emit('startFlooding', config);
    startBtn.disabled = true;
    stopBtn.disabled = false;
    updateStatus('running', 'Flooding in progress');
});

stopBtn.addEventListener('click', () => {
    socket.emit('stopFlooding');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    controlPanel.style.display = 'none';
    updateStatus('stopped', 'Ready');
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
    updateStatus('ready', 'Bots ready - Control panel active');
});

socket.on('floodingStopped', () => {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    controlPanel.style.display = 'none';
    updateStatus('stopped', 'Ready');
});
