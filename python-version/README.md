# Kahoot Flooder - Python Version

This is the original Python version of the Kahoot flooder using Selenium WebDriver with a Tkinter GUI interface.

## Features

- Create multiple bot instances to flood a Kahoot game
- Desktop GUI interface using Tkinter
- Configurable bot names, batch creation, and delays
- Headless or visible browser mode
- Support for automatic reactions
- Real-time bot control panel for sending reactions and answers

## Installation

1. Make sure you have Python 3.7+ installed
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Run the script:
   ```bash
   python kahoot_flooder.py
   ```

2. Enter the Kahoot PIN and configure your bot settings in the GUI

3. Click "Start Flooding" to create the bots

4. Once bots are ready, use the control window to send reactions or answers to all bots simultaneously

## Configuration Options

- **Kahoot PIN**: The game PIN to join
- **Number of bots**: How many bots to create
- **Name template**: Template for bot names (use `{}` as placeholder for bot number)
- **Batch delay**: Delay between creating batches of bots (in seconds)
- **Enable reactions**: Whether to send initial reactions when joining
- **Reaction choice**: Which reaction to send (Thinking, Wow, Heart, ThumbsUp, or Random)
- **Headless mode**: Run browsers in background (recommended for performance)

## Requirements

- Python 3.7+
- Chrome browser
- ChromeDriver (automatically managed by webdriver-manager)

## Differences from Puppeteer Version

- Desktop GUI using Tkinter instead of web interface
- Uses Selenium WebDriver instead of Puppeteer
- Threading-based approach for bot management
- May have performance limitations with large numbers of bots

## Legal Notice

This tool is for educational purposes only. Using bots in Kahoot games may violate Kahoot's terms of service. Use at your own risk.
