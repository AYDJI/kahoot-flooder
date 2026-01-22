# Kahoot Flooder - Puppeteer Version

This is a Node.js/Puppeteer version of the Kahoot flooder, providing a web-based interface instead of a desktop GUI.

## Features

- Create multiple bot instances to flood a Kahoot game
- Web-based interface accessible from any browser
- Real-time bot control (send reactions and answers to all bots)
- Configurable bot names, batch creation, and delays
- Headless or visible browser mode
- Support for automatic reactions

## Installation

1. Make sure you have Node.js installed (version 14 or higher)
2. Navigate to the puppeteer-version directory
3. Install dependencies:

   ```bash
   npm install
   ```

## Usage

1. Start the server:

   ```bash
   npm start
   ```

2. Open your browser and go to `http://localhost:3000`

3. Enter the Kahoot PIN and configure your bot settings

4. Click "Start Flooding" to create the bots

5. Once bots are ready, use the control panel to send reactions or answers to all bots simultaneously

## Configuration Options

- **Kahoot PIN**: The game PIN to join
- **Number of bots**: How many bots to create
- **Name template**: Template for bot names (use `{}` as placeholder for bot number)
- **Batch delay**: Delay between creating batches of bots (in seconds)
- **Enable reactions**: Whether to send initial reactions when joining
- **Reaction choice**: Which reaction to send (or Random)
- **Headless mode**: Run browsers in background (recommended for performance)

## Differences from Python Version

- Web-based interface instead of desktop GUI
- Uses Puppeteer instead of Selenium
- Real-time control via WebSocket
- No threading limitations (Node.js async/await)
- Potentially better performance with headless Chrome

## Requirements

- Node.js 14+
- Chrome/Chromium browser (automatically managed by Puppeteer)

## Legal Notice

This tool is for educational purposes only. Using bots in Kahoot games may violate Kahoot's terms of service. Use at your own risk.
