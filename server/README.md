# Chat Extension Server

This is a WebSocket server implementation for the Chrome chat extension using Python.

## Requirements

- Python 3.7 or higher
- pip (Python package installer)

## Setup

1. Create a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the server:
```bash
python server.py
```

The server will start on `ws://localhost:8080`

## Features

- Real-time WebSocket communication
- Unique client IDs using UUID
- Broadcast messages to all connected clients
- System messages for connection events
- Automatic cleanup of disconnected clients

## kill
```bash
pkill -f "python.*server.py"
lsof -ti:8080 | xargs kill -9

```
