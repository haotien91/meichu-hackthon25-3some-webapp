# I2C_LCD_driver.py
# Source: https://gist.github.com/damboiseb/c2d585552277d13b77823e34b9a2c336

import smbus2 as smbus
from time import sleep

# I2C bus number; change if your bus is not 1
I2C_BUS = 0 

# PCF8574 I/O expander addresses
# Find yours with `i2cdetect -y 1`
I2C_ADDR = 0x27 

# Define some device constants
LCD_WIDTH = 16    # Maximum characters per line

# Define some device commands
LCD_CHR = 1 # Mode - Sending data
LCD_CMD = 0 # Mode - Sending command

LCD_LINE_1 = 0x80 # LCD RAM address for the 1st line
LCD_LINE_2 = 0xC0 # LCD RAM address for the 2nd line

LCD_BACKLIGHT  = 0x08  # On
#LCD_BACKLIGHT = 0x00  # Off

ENABLE = 0b00000100 # Enable bit

# Timing constants
E_PULSE = 0.0005
E_DELAY = 0.0005

#Open I2C interface
bus = smbus.SMBus(I2C_BUS)

class Lcd:
    def __init__(self, addr=I2C_ADDR, bus_num=I2C_BUS):
        self.addr = addr
        self.bus = smbus.SMBus(bus_num)
        self.lcd_device_init()

    def lcd_device_init(self):
        # Initialise display
        self.lcd_byte(0x33,LCD_CMD) # 110011 Initialise
        self.lcd_byte(0x32,LCD_CMD) # 110010 Initialise
        self.lcd_byte(0x06,LCD_CMD) # 000110 Cursor move direction
        self.lcd_byte(0x0C,LCD_CMD) # 001100 Display On,Cursor Off, Blink Off
        self.lcd_byte(0x28,LCD_CMD) # 101000 Data length, number of lines, font size
        self.lcd_byte(0x01,LCD_CMD) # 000001 Clear display
        sleep(E_DELAY)

    def lcd_byte(self, bits, mode):
        # Send byte to data pins
        # bits = data
        # mode = 1 for data, 0 for command
        bits_high = mode | (bits & 0xF0) | LCD_BACKLIGHT
        bits_low = mode | ((bits<<4) & 0xF0) | LCD_BACKLIGHT

        # High bits
        self.bus.write_byte(self.addr, bits_high)
        self.lcd_toggle_enable(bits_high)

        # Low bits
        self.bus.write_byte(self.addr, bits_low)
        self.lcd_toggle_enable(bits_low)

    def lcd_toggle_enable(self, bits):
        # Toggle enable
        sleep(E_DELAY)
        self.bus.write_byte(self.addr, (bits | ENABLE))
        sleep(E_PULSE)
        self.bus.write_byte(self.addr,(bits & ~ENABLE))
        sleep(E_DELAY)

    def lcd_string(self, message,line):
        # Send string to display
        if line == 1:
            lcd_line = LCD_LINE_1
        elif line == 2:
            lcd_line = LCD_LINE_2
        else:
            return

        self.lcd_byte(lcd_line, LCD_CMD)

        for i in range(LCD_WIDTH):
            if i < len(message):
                self.lcd_byte(ord(message[i]),LCD_CHR)
            else:
                self.lcd_byte(ord(" "),LCD_CHR) # Pad with spaces

    def lcd_clear(self):
        self.lcd_byte(0x01, LCD_CMD)
        sleep(E_DELAY)