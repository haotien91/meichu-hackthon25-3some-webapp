# progress_api.py
# Lightweight FastAPI service to control the LCD progress bar
# Endpoints:
# - POST /progress/start  -> start increasing 20% per second until 100%
# - POST /progress/clear  -> stop any progress and clear the LCD
# - POST /progress/init   -> show label (line 1) + empty brackets (line 2)
# - POST /progress/increase -> increase progress by 20%
# - POST /progress/decrease -> decrease progress by 20%
# - POST /progress/reset  -> reset bar to 0% (keeps current label)
# Default port: 8002 (see __main__ runner)

from fastapi import FastAPI, Body
from fastapi.responses import JSONResponse
import threading
import time
from typing import Optional

# Reuse the existing display logic and constants
import I2C_LCD_driver
from display_progress import (
    I2C_ADDR,
    I2C_BUS,
    load_custom_chars,
    init_progress_screen,
    draw_progress_bar,
)

app = FastAPI(title="LCD Progress API", version="1.0.0")

# LCD and concurrency primitives
_lcd_lock = threading.Lock()
_stop_event = threading.Event()
_worker_thread: Optional[threading.Thread] = None
_is_running = False

# Initialize LCD once
_lcd = I2C_LCD_driver.Lcd(addr=I2C_ADDR, bus_num=I2C_BUS)
load_custom_chars(_lcd)

# Manual control state
_current_percent = 0
_current_label = "Hold on!"
_initialized = False


def _stop_worker_if_running(timeout: float = 2.0):
    global _worker_thread, _is_running
    if _is_running and _worker_thread and _worker_thread.is_alive():
        _stop_event.set()
        _worker_thread.join(timeout=timeout)
        _is_running = False
        _stop_event.clear()


def _progress_worker(
    label_init: str,
    label_running: str,
    label_done: str,
    step_percent: int,
    step_interval_s: float,
):
    global _is_running
    try:
        with _lcd_lock:
            # Atomic initial render: line 1 label + empty brackets on line 2
            init_progress_screen(_lcd, label_init)
        percent = 0

        while not _stop_event.is_set() and percent < 100:
            percent = min(100, percent + step_percent)
            with _lcd_lock:
                # Bar first (line 2), then text (line 1) happens inside draw_progress_bar
                label = label_running if percent < 100 else label_done
                draw_progress_bar(_lcd, percent, label=label)
            if percent >= 100:
                break

            # Sleep in small chunks for responsiveness to stop
            slept = 0.0
            while slept < step_interval_s and not _stop_event.is_set():
                time.sleep(min(0.05, step_interval_s - slept))
                slept += 0.05
    finally:
        _is_running = False


@app.post("/progress/start")
def start_progress(
    label_init: str = Body("Hold on!", embed=True),
    label_running: str = Body("Hold on!", embed=True),
    label_done: str = Body("Completed", embed=True),
    step_percent: int = Body(20, embed=True),
    step_interval_s: float = Body(1.0, embed=True),
):
    """Start the progress bar if not already running.
    Body fields are optional; defaults: 20% step every 1s, labels 'Progress'/'Completed'.
    """
    global _worker_thread, _is_running

    if step_percent <= 0:
        return JSONResponse(status_code=400, content={"error": "step_percent must be > 0"})
    if step_interval_s <= 0:
        return JSONResponse(status_code=400, content={"error": "step_interval_s must be > 0"})

    if _is_running and _worker_thread and _worker_thread.is_alive():
        return {"status": "already_running"}

    _stop_event.clear()
    _is_running = True
    _worker_thread = threading.Thread(
        target=_progress_worker,
        args=(label_init, label_running, label_done, step_percent, step_interval_s),
        daemon=True,
    )
    _worker_thread.start()
    return {"status": "started"}


@app.post("/progress/clear")
def clear_progress():
    """Stop any running progress and clear the LCD."""
    global _initialized, _current_label, _current_percent
    _stop_worker_if_running()
    with _lcd_lock:
        _current_label = "Hold on!"
        _lcd.lcd_clear()
    _initialized = False
    _current_percent = 0
    return {"status": "cleared"}



@app.post("/progress/init")
def init_progress(label: str = Body("Hold on!", embed=True)):
    """Initialize: show line 1 text and empty brackets with 0% progress."""
    global _initialized, _current_percent, _current_label
    _stop_worker_if_running()
    with _lcd_lock:
        init_progress_screen(_lcd, label)
    _initialized = True
    _current_percent = 0
    _current_label = label
    return {"status": "initialized", "percent": _current_percent, "label": _current_label}


@app.post("/progress/increase")
def increase_progress():
    """Increase progress by 20% (up to 100%) and update the display."""
    global _initialized, _current_percent, _current_label
    _stop_worker_if_running()
    if not _initialized:
        with _lcd_lock:
            init_progress_screen(_lcd, _current_label)
        _initialized = True
        _current_percent = 0
    new_percent = min(100, _current_percent + 20)
    new_label = "Completed" if new_percent >= 100 else _current_label
    with _lcd_lock:
        draw_progress_bar(_lcd, new_percent, label=new_label)
    _current_percent = new_percent
    _current_label = new_label
    return {"status": "increased", "percent": _current_percent, "label": _current_label}


@app.post("/progress/decrease")
def decrease_progress():
    """Decrease progress by 20% (down to 0%) and update the display."""
    global _initialized, _current_percent, _current_label
    _stop_worker_if_running()
    if not _initialized:
        with _lcd_lock:
            init_progress_screen(_lcd, _current_label)
        _initialized = True
        _current_percent = 0
    new_percent = max(0, _current_percent - 20)
    with _lcd_lock:
        _current_label = "Hold on!"
        draw_progress_bar(_lcd, new_percent, label=_current_label)
    _current_percent = new_percent
    return {"status": "decreased", "percent": _current_percent, "label": _current_label}


@app.post("/progress/reset")
def reset_progress():
    """Reset progress to 0% while keeping the current label and screen structure."""
    global _initialized, _current_percent, _current_label
    _stop_worker_if_running()
    if not _initialized:
        with _lcd_lock:
            init_progress_screen(_lcd, _current_label)
        _initialized = True
    with _lcd_lock:
        _current_label = "Hold on!"
        draw_progress_bar(_lcd, 0, label=_current_label)
    _current_percent = 0
    return {"status": "reset", "percent": _current_percent, "label": _current_label}


@app.get("/health")
def health():
    return {"ok": True, "running": _is_running, "initialized": _initialized, "percent": _current_percent}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)

