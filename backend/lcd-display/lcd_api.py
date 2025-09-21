# lcd_api.py
# Lightweight FastAPI service for initializing a 16x2 I2C LCD
# API root: /lcd
# Endpoint:
#   - POST /lcd/init -> initializes the LCD and writes two lines
#       Line 1: Team 3Some
#       Line 2: Your yoga coach
# Also includes /lcd/health for basic diagnostics.

from fastapi import FastAPI, Body
from fastapi.responses import JSONResponse
import threading
from time import sleep
# Progress bar helpers
from display_progress import load_custom_chars, init_progress_screen, update_label_delta, update_bar_delta


# Default I2C config (adjust to your setup if needed)
I2C_ADDR = 0x27
I2C_BUS = 0

# Optional: fall back to a soft/mock LCD if hardware libs are unavailable
HAS_HW = True

class _SoftLcd:
    def __init__(self, *_, **__):
        pass
    def lcd_string(self, message: str, line: int) -> None:
        print(f"[SoftLCD] line {line}: {message}")
    def lcd_clear(self) -> None:
        print("[SoftLCD] clear")
    def lcd_byte(self, *_args, **_kwargs):
        pass

try:
    import I2C_LCD_driver  # local driver module using smbus2
except Exception as e:
    HAS_HW = False
    class _Drv:
        Lcd = _SoftLcd
    I2C_LCD_driver = _Drv()  # type: ignore

app = FastAPI(title="LCD Display API", version="1.0.0")

_lcd_lock = threading.Lock()

# Initialize LCD device once
try:
    _lcd = I2C_LCD_driver.Lcd(addr=I2C_ADDR, bus_num=I2C_BUS)
except Exception:
    HAS_HW = False
    _lcd = _SoftLcd()

# Load custom characters for smooth progress bar (safe if SoftLCD)
try:
    load_custom_chars(_lcd)
except Exception:
    pass

# Lesson progress state
_lesson_started = False
_lesson_total = 0
_lesson_current = 0
_lesson_last_label = ""
_lesson_last_percent = 0


# --- Celebration animation helpers ---
def _center(text: str, width: int = 16) -> str:
    t = (text or "")[:width]
    pad = max(0, width - len(t))
    left = pad // 2
    right = pad - left
    return (" " * left) + t + (" " * right)


def _run_congrats_animation():
    """Non-blocking celebration animation when program completes.
    Runs in a background thread; best-effort with lock per write.
    """
    try:
        width = 16
        # Start with a clean screen
        try:
            with _lcd_lock:
                _lcd.lcd_clear()
        except Exception:
            pass

        # 1) Scroll "Completed!" across line 1 with a supportive line 2
        msg = "  Completed!  "  # padded for nicer scroll
        scroll = (" " * width) + msg + (" " * width)
        for i in range(0, len(scroll) - width + 1):
            frame = scroll[i:i+width]
            try:
                with _lcd_lock:
                    _lcd.lcd_string(frame, 1)
                    _lcd.lcd_string(_center("Great Job!", width), 2)
            except Exception:
                pass
            sleep(0.01)

        # 2) Brief blink effect on line 2 (fake blink by toggling spaces)
        final1 = _center("Completed!", width)
        final2 = _center("Great Job!", width)
        for _ in range(3):
            try:
                with _lcd_lock:
                    _lcd.lcd_string(final1, 1)
                    _lcd.lcd_string(final2, 2)
            except Exception:
                pass
            sleep(0.18)
            try:
                with _lcd_lock:
                    _lcd.lcd_string(final1, 1)
                    _lcd.lcd_string(" " * width, 2)
            except Exception:
                pass
            sleep(0.12)

        # 3) Settle on the final congratulations text
        try:
            with _lcd_lock:
                _lcd.lcd_string(final1, 1)
                _lcd.lcd_string(final2, 2)
        except Exception:
            pass
    except Exception:
        # Best-effort; never raise from background thread
        pass

@app.get("/lcd/health")
def health():
    return {
        "ok": True,
        "has_hw": HAS_HW,
        "i2c_addr": hex(I2C_ADDR),
        "i2c_bus": I2C_BUS,
        "lesson_started": _lesson_started,
        "current": _lesson_current,
        "total": _lesson_total,
    }


@app.post("/lcd/init")
def lcd_init():
    """Initialize the LCD and write the default two lines."""
    try:
        with _lcd_lock:
            # Clear, then write both lines
            _lcd.lcd_clear()
            _lcd.lcd_string("Team 3Some", 1)
            _lcd.lcd_string("Your yoga coach", 2)
        return {"ok": True, "message": "LCD initialized with default text"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})



@app.post("/lcd/lesson-start")
def lesson_start(total: int = Body(..., embed=True)):
    """Start lesson progress tracking with total number of lessons.
    Displays 0/total on line 1 and an empty bar on line 2.
    """
    if total < 1:
        return JSONResponse(status_code=400, content={"ok": False, "error": "total must be >= 1"})
    global _lesson_started, _lesson_total, _lesson_current, _lesson_last_label, _lesson_last_percent
    _lesson_total = int(total)
    _lesson_current = 0
    _lesson_started = True
    label = f"In Progress {_lesson_current}/{_lesson_total}"
    with _lcd_lock:
        init_progress_screen(_lcd, label)
        # track last state for delta updates
        _lesson_last_label = label
        _lesson_last_percent = 0
    return {"ok": True, "current": _lesson_current, "total": _lesson_total, "completed": False, "percent": 0}


@app.post("/lcd/lesson-next")
def lesson_next():
    """Advance to the next lesson: increment progress and update bar.
    Shows new current/total on line 1. When current==total, bar is 100%.
    """
    global _lesson_started, _lesson_total, _lesson_current, _lesson_last_label, _lesson_last_percent
    if not _lesson_started or _lesson_total <= 0:
        return JSONResponse(status_code=400, content={"ok": False, "error": "lesson not started"})

    if _lesson_current < _lesson_total:
        _lesson_current += 1

    percent = int(round((_lesson_current / _lesson_total) * 100)) if _lesson_total else 0
    completed = _lesson_current >= _lesson_total
    label = f"In Progress {_lesson_current}/{_lesson_total}"

    if completed:
        # Celebrate completion: clear and run a brief animation in background
        _lesson_last_label = label
        _lesson_last_percent = 100
        try:
            with _lcd_lock:
                _lcd.lcd_clear()
        except Exception:
            pass
        try:
            t = threading.Thread(target=_run_congrats_animation, daemon=True)
            t.start()
        except Exception:
            pass
    else:
        with _lcd_lock:
            # Update line 1 first (minimal diff), then the bar delta — no display off/on
            update_label_delta(_lcd, _lesson_last_label, label)
            update_bar_delta(_lcd, _lesson_last_percent, percent)
            # store last state
            _lesson_last_label = label
            _lesson_last_percent = percent

    return {
        "ok": True,
        "current": _lesson_current,
        "total": _lesson_total,
        "completed": completed,
        "percent": percent,
    }


@app.post("/lcd/clear")
def lcd_clear():
    """Clear the LCD and reset any lesson progress state."""
    global _lesson_started, _lesson_total, _lesson_current, _lesson_last_label, _lesson_last_percent
    _lesson_started = False
    _lesson_total = 0
    _lesson_current = 0
    _lesson_last_label = ""
    _lesson_last_percent = 0
    try:
        with _lcd_lock:
            _lcd.lcd_clear()
        return {"ok": True, "cleared": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})



if __name__ == "__main__":
    import uvicorn
    # Run on a separate port (e.g., 8003) to avoid colliding with other services
    uvicorn.run(app, host="0.0.0.0", port=8002)

