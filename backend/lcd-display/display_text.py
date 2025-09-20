# display_text.py

import I2C_LCD_driver # Import the driver file
from time import sleep

# --- CONFIGURATION ---
# IMPORTANT: Change these values to match your setup from Step 1
I2C_ADDR = 0x27  # Your LCD's I2C address (e.g., 0x27 or 0x3f)
I2C_BUS  = 0     # The I2C bus number your display is on (e.g., 1 or 0)
# ---------------------

# Create an LCD object
# This will automatically initialize the display
mylcd = I2C_LCD_driver.Lcd(addr=I2C_ADDR, bus_num=I2C_BUS)

# --- MAIN CODE ---
try:
    print("Writing to display...")
    
    # Display text on line 1
    mylcd.lcd_string("Hello, i.MX 93!", 1)
    
    # Display text on line 2
    mylcd.lcd_string("This is line 2", 2)
    
    sleep(5) # Keep the text on screen for 5 seconds
    
    # Clear the screen
    print("Clearing display.")
    mylcd.lcd_clear()

except KeyboardInterrupt:
    print("Cleaning up!")
    mylcd.lcd_clear()