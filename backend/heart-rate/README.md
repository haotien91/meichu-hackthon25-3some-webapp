# Mi Band Heart Rate Monitor Backend

Python FastAPI backend for Mi Band Bluetooth LE heart rate monitoring.

## Setup

### 1. Create Virtual Environment
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate     # On Windows
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the Server
```bash
python main.py
```

The server will start on `http://localhost:8000`

## API Endpoints

- `GET /` - Server status
- `GET /api/devices` - List detected Mi Band devices
- `POST /api/devices/{device_id}/select` - Select device for monitoring
- `GET /api/heartrate/current` - Get current heart rate
- `GET /api/heartrate/stream` - SSE stream for real-time data
- `GET /api/scanning/status` - Get scanning status
- `POST /api/scanning/restart` - Restart device scanning

## Features

- ✅ Bluetooth LE scanning for Mi Band devices
- ✅ Real-time heart rate data parsing
- ✅ Server-Sent Events for live updates
- ✅ Device filtering (only Mi Band devices)
- ✅ Heart rate validation (40-200 BPM)
- ✅ CORS enabled for frontend integration

## Requirements

- Python 3.8+
- Bluetooth LE adapter
- Mi Band device (tested with Mi Band 7)

## Troubleshooting

### Permission Issues (macOS)
```bash
# Grant terminal Bluetooth permissions in System Preferences
```

### No Devices Found
1. Ensure Mi Band is nearby and active
2. Start heart rate measurement on Mi Band
3. Check Bluetooth is enabled on your computer

### Heart Rate Not Updating
1. Start a workout or manual heart rate measurement on Mi Band
2. Ensure device is selected via API
3. Check console output for parsing errors