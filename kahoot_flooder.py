import threading
import time
import signal
import sys
import tkinter as tk
from tkinter import ttk, messagebox
import random

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from webdriver_manager.chrome import ChromeDriverManager
import os


# =========================
# GUI
# =========================
def start_flooding():
    global pin, num_bots, name_template, batch_delay, headless_mode, enable_reactions, reaction_choice
    pin = pin_entry.get()
    if not pin:
        messagebox.showerror("Error", "Please enter a Kahoot PIN")
        return
    try:
        num_bots = int(num_bots_entry.get() or 10)
    except ValueError:
        messagebox.showerror("Error", "Number of bots must be a number")
        return
    name_template = name_template_entry.get() or "Bot{}"
    try:
        batch_delay = float(batch_delay_entry.get() or 1)
    except ValueError:
        messagebox.showerror("Error", "Batch delay must be a number")
        return
    headless_mode = headless_var.get()
    enable_reactions = enable_reactions_var.get()
    reaction_choice = reaction_var.get()

    start_button.config(state=tk.DISABLED)
    stop_button.config(state=tk.NORMAL)
    threading.Thread(target=run_flooding, daemon=True).start()

def stop_flooding():
    shutdown_handler()

def run_flooding():
    try:
        batch_size = 6

        for batch_start in range(0, num_bots, batch_size):
            if stop_event.is_set():
                break

            batch_end = min(batch_start + batch_size, num_bots)
            log_text.insert(tk.END, f"Creating bots {batch_start + 1} to {batch_end}...\n")
            log_text.see(tk.END)

            threads = []
            for i in range(batch_start, batch_end):
                t = threading.Thread(target=create_bot, args=(i,))
                threads.append(t)
                t.start()

            for t in threads:
                t.join()

            time.sleep(batch_delay)

        mode = "headless" if headless_mode else "visible"
        log_text.insert(tk.END, f"\nSuccessfully created {len(drivers)} bots for PIN {pin}.\n")
        log_text.insert(tk.END, f"Bots are running in {mode} mode.\n")
        log_text.see(tk.END)

        # Keep running until interrupted
        while not stop_event.is_set():
            time.sleep(1)

    except Exception as e:
        log_text.insert(tk.END, f"Unexpected error: {e}\n")
        shutdown_handler()

root = tk.Tk()
root.title("Kahoot Flooder")

# Labels and entries
ttk.Label(root, text="Kahoot PIN:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=5)
pin_entry = ttk.Entry(root)
pin_entry.grid(row=0, column=1, padx=5, pady=5)

ttk.Label(root, text="Number of bots:").grid(row=1, column=0, sticky=tk.W, padx=5, pady=5)
num_bots_entry = ttk.Entry(root)
num_bots_entry.insert(0, "10")
num_bots_entry.grid(row=1, column=1, padx=5, pady=5)

ttk.Label(root, text="Name template:").grid(row=2, column=0, sticky=tk.W, padx=5, pady=5)
name_template_entry = ttk.Entry(root)
name_template_entry.insert(0, "Bot{}")
name_template_entry.grid(row=2, column=1, padx=5, pady=5)

ttk.Label(root, text="Batch delay (seconds):").grid(row=3, column=0, sticky=tk.W, padx=5, pady=5)
batch_delay_entry = ttk.Entry(root)
batch_delay_entry.insert(0, "1")
batch_delay_entry.grid(row=3, column=1, padx=5, pady=5)

enable_reactions_var = tk.BooleanVar(value=True)
enable_reactions_check = ttk.Checkbutton(root, text="Enable reactions", variable=enable_reactions_var)
enable_reactions_check.grid(row=4, column=0, columnspan=2, pady=5)

ttk.Label(root, text="Reaction choice:").grid(row=5, column=0, sticky=tk.W, padx=5, pady=5)
reaction_var = tk.StringVar(value="Random")
reaction_combo = ttk.Combobox(root, textvariable=reaction_var, values=["Random", "Thinking", "Wow", "Heart", "ThumbsUp"])
reaction_combo.grid(row=5, column=1, padx=5, pady=5)

headless_var = tk.BooleanVar(value=True)
headless_check = ttk.Checkbutton(root, text="Headless mode", variable=headless_var)
headless_check.grid(row=6, column=0, columnspan=2, pady=5)

# Buttons
start_button = ttk.Button(root, text="Start Flooding", command=start_flooding)
start_button.grid(row=7, column=0, padx=5, pady=10)

stop_button = ttk.Button(root, text="Stop Flooding", command=stop_flooding, state=tk.DISABLED)
stop_button.grid(row=7, column=1, padx=5, pady=10)

# Log text area
log_frame = ttk.Frame(root)
log_frame.grid(row=8, column=0, columnspan=2, padx=5, pady=5, sticky=(tk.W, tk.E, tk.N, tk.S))

log_text = tk.Text(log_frame, height=10, width=50, wrap=tk.WORD)
log_scroll = ttk.Scrollbar(log_frame, orient=tk.VERTICAL, command=log_text.yview)
log_text.config(yscrollcommand=log_scroll.set)

log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
log_scroll.pack(side=tk.RIGHT, fill=tk.Y)

root.columnconfigure(1, weight=1)
root.rowconfigure(8, weight=1)

# =========================
# Shared state
# =========================
drivers = []
drivers_lock = threading.Lock()
stop_event = threading.Event()
headless_mode = True


# =========================
# Bot creation function
# =========================
def create_bot(bot_index):
    driver = None
    try:
        chrome_options = Options()
        if headless_mode:
            chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        if headless_mode:
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            chrome_options.add_argument("--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

        driver_path = ChromeDriverManager().install()
        if 'THIRD_PARTY_NOTICES' in driver_path:
            base_dir = os.path.dirname(driver_path)
            driver_path = os.path.join(base_dir, 'chromedriver')
        os.chmod(driver_path, 0o755)
        driver = webdriver.Chrome(
            service=Service(driver_path),
            options=chrome_options
        )

        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        driver.get("https://kahoot.it/")

        wait = WebDriverWait(driver, 15)

        # Enter PIN
        pin_input = wait.until(
            EC.presence_of_element_located((By.ID, "game-input"))
        )
        pin_input.send_keys(pin)
        pin_input.send_keys(Keys.RETURN)

        # Enter nickname
        nickname_input = wait.until(
            EC.presence_of_element_located((By.ID, "nickname"))
        )
        nickname = name_template.format(bot_index + 1)
        nickname_input.send_keys(nickname)
        nickname_input.send_keys(Keys.RETURN)

        time.sleep(2)  # Wait for page

        # Click reaction button if enabled
        if enable_reactions:
            try:
                reaction_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, '[data-functional-selector="reaction-prompt-button"]')))
                reaction_button.click()
                time.sleep(1)

                # Choose and click reaction
                reaction_types = ["Thinking", "Wow", "Heart", "ThumbsUp"]
                if reaction_choice == "Random":
                    chosen = random.choice(reaction_types)
                else:
                    chosen = reaction_choice
                reaction_option = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, f'[data-functional-selector="reaction-type-{chosen}"]')))
                reaction_option.click()
                time.sleep(1)
            except:
                pass

        # Store driver safely
        with drivers_lock:
            drivers.append(driver)

    except Exception as e:
        log_text.insert(tk.END, f"[Bot {bot_index + 1}] Failed: {e}\n")
        log_text.see(tk.END)
        if driver:
            try:
                driver.quit()
            except:
                pass


# =========================
# Graceful shutdown handler
# =========================
def shutdown_handler(signum=None, frame=None):
    stop_event.set()

    with drivers_lock:
        for driver in drivers:
            try:
                driver.quit()
            except:
                pass
        drivers.clear()

    log_text.insert(tk.END, "All bots closed.\n")
    log_text.see(tk.END)


root.mainloop()
