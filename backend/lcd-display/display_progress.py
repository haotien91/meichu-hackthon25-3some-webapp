# display_progress.py
# Render a smooth progress bar on a 16x2 I2C LCD using custom characters (HD44780)
# Works with the provided I2C_LCD_driver.Lcd class

import I2C_LCD_driver
from time import sleep

# --- CONFIGURATION (adjust if needed) ---
I2C_ADDR = 0x27  # Your LCD's I2C address (e.g., 0x27 or 0x3f)
I2C_BUS  = 0     # I2C bus number (match your setup)
LCD_WIDTH = 16   # columns

# Custom character slots (0..5 used)
# Each list has 8 rows (5-bit wide). We fill horizontally from left to right.
CUSTOM_CHARS = {
    0: [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],  # empty
    1: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000],  # 1/5
    2: [0b11000, 0b11000, 0b11000, 0b11000, 0b11000, 0b11000, 0b11000, 0b11000],  # 2/5
    3: [0b11100, 0b11100, 0b11100, 0b11100, 0b11100, 0b11100, 0b11100, 0b11100],  # 3/5
    4: [0b11110, 0b11110, 0b11110, 0b11110, 0b11110, 0b11110, 0b11110, 0b11110],  # 4/5
    5: [0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111],  # full block
}


def _lcd_set_ddram_addr(lcd: I2C_LCD_driver.Lcd, line: int, col: int) -> None:
    """Set cursor to (line, col) where line is 1 or 2 and col is 0..15."""
    if line == 1:
        base = I2C_LCD_driver.LCD_LINE_1
    elif line == 2:
        base = I2C_LCD_driver.LCD_LINE_2
    else:
        return
    lcd.lcd_byte(base + col, I2C_LCD_driver.LCD_CMD)


def _lcd_write_char(lcd: I2C_LCD_driver.Lcd, value: int) -> None:
    lcd.lcd_byte(value, I2C_LCD_driver.LCD_CHR)


def load_custom_chars(lcd: I2C_LCD_driver.Lcd) -> None:
    """Load bar segment custom characters (slots 0..5) into CGRAM."""
    for slot, bitmap in CUSTOM_CHARS.items():
        # Set CGRAM address: 0x40 + (slot * 8)
        lcd.lcd_byte(0x40 | ((slot & 0x7) << 3), I2C_LCD_driver.LCD_CMD)
        for row in bitmap:
            _lcd_write_char(lcd, row)


def draw_progress_bar(lcd: I2C_LCD_driver.Lcd, percent: float, label: str | None = None) -> None:
    """
    Draw a smooth progress bar on line 2 and an optional label on line 1.
    Update order: line 2 (bar) first, then line 1 (text).
    - percent: 0..100
    - label: if provided, displayed as given (trimmed/padded to 16 chars)
    """
    p = max(0.0, min(100.0, float(percent)))

    # Prepare title but render it AFTER the bar to respect update order
    if label is None:
        title = "Stay!"
    else:
        title = f"{label}"

    # Line 2: [##############] with smooth segments inside (render first)
    _lcd_set_ddram_addr(lcd, 2, 0)
    _lcd_write_char(lcd, ord('['))

    BAR_INNER_WIDTH = LCD_WIDTH - 2  # reserve 1 char each for '[' and ']'
    total_subunits = BAR_INNER_WIDTH * 5  # 5 subunits per cell (0..5)
    filled = int(round(p / 100.0 * total_subunits))

    full_cells = filled // 5
    remainder = filled % 5  # 0..4 (use slot index same as remainder)

    # Write full cells
    for _ in range(full_cells):
        _lcd_write_char(lcd, 5)  # full block custom char

    # Write partial cell (if any)
    if full_cells < BAR_INNER_WIDTH:
        if remainder > 0:
            _lcd_write_char(lcd, remainder)  # 1..4
            cells_written = full_cells + 1
        else:
            # no partial; write empty cell at this position
            _lcd_write_char(lcd, 0)
            cells_written = full_cells + 1
    else:
        cells_written = full_cells

    # Pad remaining with empty cells
    for _ in range(BAR_INNER_WIDTH - cells_written):
        _lcd_write_char(lcd, 0)

    _lcd_write_char(lcd, ord(']'))

    # Line 1: render text AFTER bar
    lcd.lcd_string(title[:LCD_WIDTH].ljust(LCD_WIDTH), 1)



def init_progress_screen(lcd: I2C_LCD_driver.Lcd, label: str) -> None:
    """Initial render: atomically show line 1 text and empty brackets on line 2.
    We turn the display off, write both lines, then turn it back on to avoid
    visible partial updates.
    """
    # Display OFF
    lcd.lcd_byte(0x08, I2C_LCD_driver.LCD_CMD)

    # Line 1 text
    lcd.lcd_string(label[:LCD_WIDTH].ljust(LCD_WIDTH), 1)

    # Line 2 brackets + empty inner cells
    _lcd_set_ddram_addr(lcd, 2, 0)
    _lcd_write_char(lcd, ord('['))
    BAR_INNER_WIDTH = LCD_WIDTH - 2
    for _ in range(BAR_INNER_WIDTH):
        _lcd_write_char(lcd, 0)
    _lcd_write_char(lcd, ord(']'))

    # Display ON (Display on, Cursor off, Blink off)
    lcd.lcd_byte(0x0C, I2C_LCD_driver.LCD_CMD)



def demo_loop():
    """Run 0->100% increasing by 20% per second, then exit."""
    lcd = I2C_LCD_driver.Lcd(addr=I2C_ADDR, bus_num=I2C_BUS)
    load_custom_chars(lcd)

    try:
        # Initial render: line 1 text first, then brackets on line 2
        init_progress_screen(lcd, "Stay!")
        # Start increasing the bar; always update line 2 first
        for p in range(20, 101, 20):
            label = "Stay!" if p < 100 else "Finish!"
            draw_progress_bar(lcd, p, label=label)
            if p < 100:
                sleep(1)
    except KeyboardInterrupt:
        lcd.lcd_clear()


if __name__ == "__main__":
    demo_loop()

