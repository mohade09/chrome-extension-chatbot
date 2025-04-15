const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: 8080 });

// Store connected clients
const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  clients.set(ws, clientId);

  console.log(`Client connected: ${clientId}`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    text: 'Connected to chat server',
    timestamp: new Date().toISOString()
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    
    // Broadcast message to all clients except sender
    clients.forEach((id, client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          ...message,
          clientId,
          type: 'received'
        }));
      }
    });
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    clients.delete(ws);
  });
});
