# Kahoot Flooder

A Python script that creates multiple bot accounts to flood a Kahoot quiz session. The bots join simultaneously for maximum speed.

## Features

- GUI interface for easy configuration
- Optimized for fast bot joining with parallel processing
- Headless Chrome browsers to avoid visual clutter
- Customizable number of bots, names, and delays

## Requirements

- Python 3.7+
- Google Chrome browser installed
- Windows/Linux/MacOS

## Installation

1. Clone or download the repository.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Run the script:
   ```bash
   python kahoot_flooder.py
   ```

2. In the GUI:
   - Enter the Kahoot PIN for the session you want to flood.
   - Set the number of bots (default: 10).
   - Customize the name template (default: "Bot{}" where {} is the bot number).
   - Adjust batch delay if needed (default: 0 for maximum speed).
   - Click "Start Flooding".

3. The script will create bots that join the Kahoot session simultaneously.
4. Bots will remain in the session until you click "Stop Flooding".

## Optimizations

- All bots start joining at the same time (no batching delays).
- Chrome runs in headless mode with performance optimizations (disabled images, extensions, etc.).
- Parallel thread execution for concurrent bot creation.

## Disclaimer

This tool is for educational purposes only. Flooding Kahoot sessions may violate terms of service and could result in bans. Use responsibly.
