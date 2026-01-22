# Kahoot Flooder

A tool that creates multiple bot accounts to flood a Kahoot quiz session. Available in two implementations:

## Project Structure

- **`python-version/`** - Original Python implementation using Selenium WebDriver with Tkinter GUI
- **`puppeteer-version/`** - Modern Node.js/Puppeteer implementation with web-based interface

## Python Version (python-version/)

**Features:**

- Desktop GUI interface using Tkinter
- Selenium WebDriver automation
- Threading-based bot management
- Real-time control panel for reactions and answers

**Requirements:**

- Python 3.7+
- Google Chrome browser
- ChromeDriver (auto-managed)

**Quick Start:**

```bash
cd python-version
pip install -r requirements.txt
python kahoot_flooder.py
```

## Puppeteer Version (puppeteer-version/)

**Features:**

- Modern web-based interface
- Puppeteer for headless Chrome automation
- Real-time communication via WebSocket
- Better performance for large bot counts
- Cross-platform web interface

**Requirements:**

- Node.js 14+
- Chrome/Chromium browser

**Quick Start:**

```bash
cd puppeteer-version
npm install
npm start
# Then open http://localhost:3000
```

## Common Features

Both versions support:

- Multiple bot creation with customizable names
- Batch processing with configurable delays
- Headless/visible browser modes
- Automatic reactions on join
- Real-time control of all bots (reactions and answers)
- Configurable bot counts and naming templates

## Disclaimer

This tool is for educational purposes only. Using bots in Kahoot games may violate Kahoot's terms of service. Use at your own risk.
