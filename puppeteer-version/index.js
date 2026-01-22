const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const puppeteer = require('puppeteer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let browsers = [];
let pages = [];
let isRunning = false;
let stopRequested = false;

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('startFlooding', async (config) => {
        if (isRunning) return;

        isRunning = true;
        stopRequested = false;

        try {
            await startFlooding(config, socket);
        } catch (error) {
            socket.emit('log', `Error: ${error.message}`);
        } finally {
            isRunning = false;
        }
    });

    socket.on('stopFlooding', async () => {
        stopRequested = true;
        await cleanup();
        socket.emit('floodingStopped');
    });

    socket.on('sendReaction', (reactionType) => {
        sendReactionToAll(reactionType);
    });

    socket.on('sendAnswer', (answerIndex) => {
        sendAnswerToAll(answerIndex);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

async function startFlooding(config, socket) {
    const {
        pin,
        numBots,
        nameTemplate,
        batchDelay,
        enableReactions,
        reactionChoice,
        headlessMode
    } = config;

    const batchSize = 6;

    for (let batchStart = 0; batchStart < numBots; batchStart += batchSize) {
        if (stopRequested) break;

        const batchEnd = Math.min(batchStart + batchSize, numBots);
        socket.emit('log', `Creating bots ${batchStart + 1} to ${batchEnd}...`);

        const promises = [];
        for (let i = batchStart; i < batchEnd; i++) {
            promises.push(createBot(i, pin, nameTemplate, enableReactions, reactionChoice, headlessMode, socket));
        }

        await Promise.all(promises);

        if (batchDelay > 0) {
            await sleep(batchDelay * 1000);
        }
    }

    const mode = headlessMode ? "headless" : "visible";
    socket.emit('log', `\nSuccessfully created ${pages.length} bots for PIN ${pin}.`);
    socket.emit('log', `Bots are running in ${mode} mode.`);
    socket.emit('botsReady');
}

async function createBot(botIndex, pin, nameTemplate, enableReactions, reactionChoice, headlessMode, socket) {
    try {
        const browser = await puppeteer.launch({
            headless: headlessMode,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // Set user agent to avoid detection
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate to Kahoot
        await page.goto('https://kahoot.it/', { waitUntil: 'networkidle2' });

        // Wait for and enter PIN
        await page.waitForSelector('#game-input', { timeout: 10000 });
        await page.type('#game-input', pin);
        await page.keyboard.press('Enter');

        // Wait for and enter nickname
        await page.waitForSelector('#nickname', { timeout: 10000 });
        const nickname = nameTemplate.replace('{}', (botIndex + 1).toString());
        await page.type('#nickname', nickname);
        await page.keyboard.press('Enter');

        // Wait a bit for the page to load
        await sleep(2000);

        // Click reaction button if enabled
        if (enableReactions) {
            try {
                await page.waitForSelector('[data-functional-selector="reaction-prompt-button"]', { timeout: 5000 });
                await page.click('[data-functional-selector="reaction-prompt-button"]');
                await sleep(1000);

                let chosenReaction = reactionChoice;
                if (reactionChoice === 'Random') {
                    const reactions = ['Thinking', 'Wow', 'Heart', 'ThumbsUp'];
                    chosenReaction = reactions[Math.floor(Math.random() * reactions.length)];
                }

                await page.click(`[data-functional-selector="reaction-type-${chosenReaction}"]`);
                await sleep(1000);
            } catch (error) {
                // Reaction might not be available, continue
            }
        }

        browsers.push(browser);
        pages.push(page);

    } catch (error) {
        socket.emit('log', `[Bot ${botIndex + 1}] Failed: ${error.message}`);
    }
}

async function sendReactionToAll(reactionType) {
    const promises = pages.map(async (page, index) => {
        try {
            await page.waitForSelector('[data-functional-selector="reaction-prompt-button"]', { timeout: 5000 });
            await page.click('[data-functional-selector="reaction-prompt-button"]');
            await sleep(500);

            await page.click(`[data-functional-selector="reaction-type-${reactionType}"]`);
            await sleep(500);
        } catch (error) {
            // Bot might not be ready for reactions
        }
    });

    await Promise.all(promises);
}

async function sendAnswerToAll(answerIndex) {
    const promises = pages.map(async (page, index) => {
        try {
            await page.click(`[data-functional-selector="answer-${answerIndex}"]`, { timeout: 5000 });
            await sleep(500);
        } catch (error) {
            // Answer button might not be available
        }
    });

    await Promise.all(promises);
}

async function cleanup() {
    for (const page of pages) {
        try {
            await page.close();
        } catch (error) {
            // Page might already be closed
        }
    }

    for (const browser of browsers) {
        try {
            await browser.close();
        } catch (error) {
            // Browser might already be closed
        }
    }

    pages = [];
    browsers = [];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('SIGINT', async () => {
    console.log('Received SIGINT, cleaning up...');
    await cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, cleaning up...');
    await cleanup();
    process.exit(0);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
