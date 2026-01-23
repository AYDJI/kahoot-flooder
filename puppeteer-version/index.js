const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let browsers = [];
let pages = [];
let isRunning = false;
let stopRequested = false;
let aiConfig = null;
let currentQuestion = null;
let currentAnswer = null;
let isQueryingAI = false; // Lock to prevent multiple bots from querying AI simultaneously

app.use(express.static('public'));

// AI Functions
function parseAnswerNumber(text, numAnswers) {
    // First, try to find numbers in the valid range (1 to numAnswers)
    const numbers = text.match(/\d+/g);
    if (numbers) {
        for (const numStr of numbers) {
            const num = parseInt(numStr);
            if (num >= 1 && num <= numAnswers) {
                return num - 1; // Convert to 0-based index
            }
        }
    }
    // If no valid number found, return 0 (first answer)
    return 0;
}

async function queryGemini(question, answers, apiKey) {
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const numOptions = answers.length;
        const optionsList = Array.from({length: numOptions}, (_, i) => i + 1).join(', ');
        const prompt = `Question: ${question}\n\nAnswer options:\n${answers.map((ans, i) => `${i + 1}. ${ans}`).join('\n')}\n\nWhich answer option number (${optionsList}) is correct? Respond with ONLY the number (1-${numOptions}), nothing else.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        return parseAnswerNumber(text, numOptions);
    } catch (error) {
        console.error('Gemini error:', error);
        return 0;
    }
}

async function queryOllama(question, answers, model) {
    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: `Question: ${question}\n\nAnswer options:\n${answers.map((ans, i) => `${i + 1}. ${ans}`).join('\n')}\n\nWhich answer option number (${Array.from({length: answers.length}, (_, i) => i + 1).join(', ')}) is correct? Respond with ONLY the number (1-${answers.length}), nothing else.`,
                stream: false
            })
        });

        const data = await response.json();
        return parseAnswerNumber(data.response, answers.length);
    } catch (error) {
        console.error('Ollama error:', error);
        return 0;
    }
}

async function queryOpenRouter(question, answers, apiKey, model) {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [{
                    role: 'user',
                    content: `Question: ${question}\n\nAnswer options:\n${answers.map((ans, i) => `${i + 1}. ${ans}`).join('\n')}\n\nWhich answer option number (${Array.from({length: answers.length}, (_, i) => i + 1).join(', ')}) is correct? Respond with ONLY the number (1-${answers.length}), nothing else.`
                }]
            })
        });

        const data = await response.json();
        const text = data.choices[0].message.content.trim();
        return parseAnswerNumber(text, answers.length);
    } catch (error) {
        console.error('OpenRouter error:', error);
        return 0;
    }
}

async function getAIAnswer(question, answers, aiConfig) {
    if (!aiConfig || !answers || answers.length === 0) {
        console.error('Invalid AI config or answers');
        return 0;
    }

    const { aiProvider, apiKey, ollamaModel, openRouterModel } = aiConfig;

    const prompt = `Question: ${question}\n\nAnswer options:\n${answers.map((ans, i) => `${i + 1}. ${ans}`).join('\n')}\n\nWhat is the correct answer number? Respond with only the number.`;

    console.log('Sending to AI:', { provider: aiProvider, prompt });

    let answerIndex;
    try {
        switch (aiProvider) {
            case 'gemini':
                if (!apiKey) {
                    console.error('Gemini API key missing');
                    return 0;
                }
                answerIndex = await queryGemini(question, answers, apiKey);
                break;
            case 'ollama':
                if (!ollamaModel) {
                    console.error('Ollama model missing');
                    return 0;
                }
                answerIndex = await queryOllama(question, answers, ollamaModel);
                break;
            case 'openrouter':
                if (!apiKey || !openRouterModel) {
                    console.error('OpenRouter API key or model missing');
                    return 0;
                }
                answerIndex = await queryOpenRouter(question, answers, apiKey, openRouterModel);
                break;
            default:
                console.error('Unknown AI provider:', aiProvider);
                answerIndex = 0;
        }

        // Validate answer index is within bounds
        if (answerIndex < 0 || answerIndex >= answers.length) {
            console.warn(`AI returned invalid answer index ${answerIndex}, defaulting to 0`);
            answerIndex = 0;
        }

        console.log('AI response:', answerIndex, `(${answers[answerIndex]})`);
        return answerIndex;
    } catch (error) {
        console.error('Error getting AI answer:', error);
        return 0;
    }
}

async function extractQuestionAndAnswers(page) {
    try {
        // Check if page is still valid
        if (page.isClosed()) {
            console.log('Page is closed');
            return null;
        }

        // Use page.evaluate to find question and answer elements
        const qa = await page.evaluate(() => {
            // First, check if we're actually on a question screen by looking for the question title
            const questionElement = document.querySelector('[data-functional-selector="block-title"]');
            if (!questionElement) {
                return null;
            }

            const question = questionElement.textContent.trim();
            // Filter out invalid question texts
            if (question.length < 10 || 
                question.length > 500 || 
                question.toLowerCase().includes('kahoot!') || 
                question.toLowerCase().includes('pin') ||
                question.toLowerCase().includes('waiting') ||
                question.toLowerCase().includes('loading') ||
                question.toLowerCase().includes('privacy') ||
                question.toLowerCase().includes('cookies')) {
                return null;
            }

            // Look for answer elements - they're in <p> tags with specific classes
            // Try multiple selectors to find answer choices
            const answerSelectors = [
                'p.centered-floated-text__ChoiceText-sc-wq1dlx-6',
                'p[class*="ChoiceText"]',
                'p[class*="centered-floated-text"]',
                '[data-functional-selector^="answer-"]',
                'button[data-functional-selector^="answer-"]'
            ];

            let answerElements = [];
            
            for (const selector of answerSelectors) {
                const elements = Array.from(document.querySelectorAll(selector));
                for (const el of elements) {
                    const style = window.getComputedStyle(el);
                    // Check if element is visible
                    if (style.display === 'none' || 
                        style.visibility === 'hidden' ||
                        el.offsetWidth === 0 ||
                        el.offsetHeight === 0) {
                        continue;
                    }

                    // Get the text content
                    const text = el.textContent.trim();
                    
                    // Filter out invalid answer texts (UI elements, navigation, etc.)
                    const invalidTexts = [
                        'jump to main content',
                        'cookies',
                        'privacy',
                        'accept',
                        'reject',
                        'settings',
                        'icon',
                        'answer streak',
                        'incorrect',
                        'correct',
                        'waiting',
                        'loading',
                        'pin',
                        'nickname',
                        'enter'
                    ];

                    const lowerText = text.toLowerCase();
                    let isValid = true;
                    for (const invalid of invalidTexts) {
                        if (lowerText.includes(invalid)) {
                            isValid = false;
                            break;
                        }
                    }

                    // Must have actual content
                    if (!isValid || text.length < 2 || /^[\d\s\W]+$/.test(text)) {
                        continue;
                    }

                    // Check if we already have this answer
                    if (answerElements.some(a => a.text === text)) {
                        continue;
                    }

                    // Find the clickable parent (button or div with role="button")
                    let clickableElement = el;
                    let parent = el.parentElement;
                    while (parent && parent !== document.body) {
                        const tagName = parent.tagName.toLowerCase();
                        const role = parent.getAttribute('role');
                        const hasClickHandler = parent.onclick !== null || 
                                                parent.getAttribute('onclick') !== null ||
                                                parent.style.cursor === 'pointer';
                        
                        if (tagName === 'button' || 
                            role === 'button' || 
                            hasClickHandler ||
                            parent.classList.contains('button') ||
                            parent.getAttribute('data-functional-selector')?.startsWith('answer-')) {
                            clickableElement = parent;
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    answerElements.push({
                        text: text,
                        clickableElement: clickableElement,
                        originalElement: el,
                        index: answerElements.length
                    });
                }
                
                // If we found at least 2 answers, we're good
                if (answerElements.length >= 2) {
                    break;
                }
            }

            // Need at least 2 valid answers
            if (answerElements.length < 2) {
                return null;
            }

            // Sort answers by their position in the DOM to maintain order (red, blue, yellow, green)
            // Get all elements in document order
            const allElements = Array.from(document.querySelectorAll('p.centered-floated-text__ChoiceText-sc-wq1dlx-6, p[class*="ChoiceText"]'));
            const orderedAnswers = [];
            
            // Reorder answerElements based on DOM position
            for (const domEl of allElements) {
                const found = answerElements.find(ae => ae.originalElement === domEl);
                if (found) {
                    orderedAnswers.push(found);
                }
            }
            
            // If ordering worked, use it; otherwise keep original order
            if (orderedAnswers.length === answerElements.length) {
                answerElements = orderedAnswers;
            }

            // Re-index to ensure correct order
            answerElements.forEach((el, idx) => {
                el.index = idx;
            });

            const answers = answerElements.map(a => a.text);
            const answerElementsData = answerElements.map(a => ({ 
                text: a.text, 
                index: a.index,
                selector: a.clickableElement.getAttribute('data-functional-selector') || null
            }));
            
            return { question, answers, answerElements: answerElementsData };
        });

        if (qa && qa.question && qa.answers.length >= 2) {
            console.log('Extracted question:', qa.question);
            console.log('Extracted answers:', qa.answers);
            return qa;
        } else {
            // Don't log when no question found - this is normal when waiting
            return null;
        }

    } catch (error) {
        if (error.message.includes('detached') || error.message.includes('closed')) {
            console.log('Page detached or closed during extraction');
            return null;
        }
        console.error('Error extracting question:', error);
        return null;
    }
}

async function monitorForQuestions(page, botIndex, socket) {
    while (!stopRequested) {
        try {
            // Check if page is still valid
            if (page.isClosed()) {
                socket.emit('log', `Bot ${botIndex + 1} page closed, stopping monitoring`);
                break;
            }

            const qa = await extractQuestionAndAnswers(page);
            if (qa && qa.question && qa.answers.length >= 2) {
                // Check if this is a new question (using global variable)
                if (currentQuestion !== qa.question) {
                    // New question detected - only query AI once for all bots
                    if (!isQueryingAI) {
                        isQueryingAI = true;
                        console.log(`New question detected: ${qa.question}`);
                        socket.emit('log', `Question: ${qa.question}`);
                        currentQuestion = qa.question;
                        currentAnswer = null; // Reset answer
                        
                        if (aiConfig) {
                            try {
                                // Query AI once and share answer across all bots
                                currentAnswer = await getAIAnswer(qa.question, qa.answers, aiConfig);
                                console.log(`AI chose answer ${currentAnswer + 1} (${qa.answers[currentAnswer]})`);
                                socket.emit('log', `AI chose answer ${currentAnswer + 1}: ${qa.answers[currentAnswer]}`);
                            } catch (error) {
                                console.error('Error querying AI:', error);
                                currentAnswer = 0; // Default to first answer on error
                            }
                        } else {
                            console.log(`AI not configured, skipping answer`);
                        }
                        isQueryingAI = false;
                    } else {
                        // Another bot is querying, wait for it to finish
                        while (isQueryingAI && currentQuestion === qa.question) {
                            await sleep(100);
                        }
                    }
                }

                // Only try to click if we have a valid answer index (using global variable)
                if (currentAnswer !== null && currentAnswer >= 0 && currentAnswer < qa.answers.length) {
                    // Wait a bit for answer buttons to be fully rendered
                    await sleep(500);
                    
                    const answerText = qa.answers[currentAnswer];
                    
                    // Try to click the answer using Puppeteer's native methods
                    let clicked = false;
                    
                    try {
                        // Method 1: Try data-functional-selector with Puppeteer
                        try {
                            const selector = `[data-functional-selector="answer-${currentAnswer}"]`;
                            await page.waitForSelector(selector, { timeout: 2000 });
                            await page.click(selector);
                            console.log(`Bot ${botIndex + 1}: Clicked answer ${currentAnswer + 1} using data-functional-selector`);
                            clicked = true;
                        } catch (e) {
                            // Try next method
                        }

                        // Method 2: Use evaluateHandle to get element and click directly
                        if (!clicked) {
                            try {
                                const elementHandle = await page.evaluateHandle((answerIndex) => {
                                    // Find all answer paragraphs
                                    const answerSelectors = [
                                        'p.centered-floated-text__ChoiceText-sc-wq1dlx-6',
                                        'p[class*="ChoiceText"]',
                                        'p[class*="centered-floated-text"]'
                                    ];

                                    let allAnswerParagraphs = [];
                                    for (const selector of answerSelectors) {
                                        allAnswerParagraphs = Array.from(document.querySelectorAll(selector));
                                        if (allAnswerParagraphs.length >= 2) break;
                                    }

                                    // Filter to only visible elements
                                    const visibleAnswers = allAnswerParagraphs
                                        .filter(el => {
                                            const style = window.getComputedStyle(el);
                                            return style.display !== 'none' && 
                                                   style.visibility !== 'hidden' &&
                                                   el.offsetWidth > 0 &&
                                                   el.offsetHeight > 0;
                                        });

                                    if (visibleAnswers.length > answerIndex) {
                                        const answerParagraph = visibleAnswers[answerIndex];
                                        
                                        // Find the clickable parent
                                        let clickableElement = answerParagraph;
                                        let parent = answerParagraph.parentElement;
                                        let maxDepth = 10;
                                        let depth = 0;
                                        
                                        while (parent && parent !== document.body && depth < maxDepth) {
                                            depth++;
                                            const tagName = parent.tagName.toLowerCase();
                                            const role = parent.getAttribute('role');
                                            const className = parent.className || '';
                                            
                                            // Check if it's a clickable element
                                            if (tagName === 'button' || 
                                                role === 'button' ||
                                                parent.onclick !== null ||
                                                parent.getAttribute('onclick') !== null ||
                                                parent.getAttribute('data-functional-selector')?.startsWith('answer-') ||
                                                className.includes('button') ||
                                                className.includes('choice') ||
                                                className.includes('answer') ||
                                                (parent.offsetWidth > 100 && parent.offsetHeight > 50)) {
                                                clickableElement = parent;
                                            }
                                            parent = parent.parentElement;
                                        }

                                        return clickableElement;
                                    }
                                    
                                    return null;
                                }, currentAnswer);

                                if (elementHandle && elementHandle.asElement()) {
                                    await elementHandle.asElement().click();
                                    console.log(`Bot ${botIndex + 1}: Clicked answer ${currentAnswer + 1} using element handle`);
                                    clicked = true;
                                    await elementHandle.dispose();
                                }
                            } catch (e) {
                                // Try clicking by coordinates as fallback
                                try {
                                    const box = await page.evaluate((answerIndex) => {
                                        const answerSelectors = [
                                            'p.centered-floated-text__ChoiceText-sc-wq1dlx-6',
                                            'p[class*="ChoiceText"]'
                                        ];
                                        let allAnswerParagraphs = [];
                                        for (const selector of answerSelectors) {
                                            allAnswerParagraphs = Array.from(document.querySelectorAll(selector));
                                            if (allAnswerParagraphs.length >= 2) break;
                                        }
                                        const visibleAnswers = allAnswerParagraphs.filter(el => {
                                            const style = window.getComputedStyle(el);
                                            return style.display !== 'none' && 
                                                   style.visibility !== 'hidden' &&
                                                   el.offsetWidth > 0 &&
                                                   el.offsetHeight > 0;
                                        });
                                        
                                        if (visibleAnswers.length > answerIndex) {
                                            // Get the clickable parent's bounding box
                                            const answerParagraph = visibleAnswers[answerIndex];
                                            let clickableElement = answerParagraph;
                                            let parent = answerParagraph.parentElement;
                                            let maxDepth = 10;
                                            let depth = 0;
                                            
                                            while (parent && parent !== document.body && depth < maxDepth) {
                                                depth++;
                                                const tagName = parent.tagName.toLowerCase();
                                                const role = parent.getAttribute('role');
                                                const className = parent.className || '';
                                                
                                                if (tagName === 'button' || 
                                                    role === 'button' ||
                                                    parent.onclick !== null ||
                                                    parent.getAttribute('data-functional-selector')?.startsWith('answer-') ||
                                                    className.includes('button') ||
                                                    className.includes('choice') ||
                                                    className.includes('answer') ||
                                                    (parent.offsetWidth > 100 && parent.offsetHeight > 50)) {
                                                    clickableElement = parent;
                                                }
                                                parent = parent.parentElement;
                                            }
                                            
                                            const rect = clickableElement.getBoundingClientRect();
                                            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                                        }
                                        return null;
                                    }, currentAnswer);
                                    
                                    if (box) {
                                        await page.mouse.click(box.x, box.y);
                                        console.log(`Bot ${botIndex + 1}: Clicked answer ${currentAnswer + 1} by coordinates (${box.x}, ${box.y})`);
                                        clicked = true;
                                    }
                                } catch (coordError) {
                                    console.log(`Bot ${botIndex + 1}: Coordinate click failed: ${coordError.message}`);
                                }
                            }
                        }

                        if (clicked) {
                            socket.emit('log', `Bot ${botIndex + 1}: Successfully clicked answer ${currentAnswer + 1}: ${answerText}`);
                        } else {
                            console.log(`Bot ${botIndex + 1}: Could not find clickable element for answer ${currentAnswer + 1} (${answerText})`);
                            socket.emit('log', `Bot ${botIndex + 1}: Failed to click answer ${currentAnswer + 1}: ${answerText}`);
                        }
                    } catch (e) {
                        console.log(`Bot ${botIndex + 1}: Error clicking answer: ${e.message}`);
                        socket.emit('log', `Bot ${botIndex + 1}: Error: ${e.message}`);
                    }
                }

                // Wait for next question or end
                await sleep(1000);
            } else {
                // Wait a bit before checking again
                await sleep(2000);
            }
        } catch (error) {
            if (error.message.includes('detached') || error.message.includes('closed')) {
                socket.emit('log', `Bot ${botIndex + 1} page detached/closed, stopping monitoring`);
                break;
            }
            console.error(`Bot ${botIndex + 1} monitoring error:`, error);
            // For other errors, wait before retry
            await sleep(2000);
        }
    }
}

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
        headlessMode,
        enableAI,
        aiProvider,
        apiKey,
        ollamaModel,
        openRouterModel
    } = config;

    aiConfig = enableAI ? { aiProvider, apiKey, ollamaModel, openRouterModel } : null;
    currentQuestion = null; // Reset for new session
    currentAnswer = null;

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

        // Start AI monitoring if enabled
        if (aiConfig) {
            console.log(`Starting AI monitoring for bot ${botIndex + 1}`);
            monitorForQuestions(page, botIndex, socket);
        } else {
            console.log(`AI not enabled for bot ${botIndex + 1}`);
        }

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
