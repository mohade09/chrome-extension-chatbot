import asyncio
import json
import uuid
import os
from typing import Dict
import websockets
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
model = genai.GenerativeModel('gemini-2.0-flash')

# Set system prompt for concise bullet-point responses
SYSTEM_PROMPT = """
You are a helpful assistant that provides concise, well-formatted responses.

Instructions:
1. Format responses as a list of bullet points using markdown
3. Keep each bullet point brief and to the point
4. Use clear, direct language
5. Limit responses to 3-5 key points
6. Ensure each point is properly formatted with proper spacing
7. Do not use sub-bullet points or nested lists
8. Use proper capitalization and punctuation

When responding, follow this exact format:
1. Start each point with number
2. Keep points concise and clear
3. Use proper capitalization and punctuation
4. Leave a blank line between points for better readability
"""

class ChatServer:
    def __init__(self):
        # Store connected clients: {websocket: client_id}
        self.clients: Dict[websockets.WebSocketServerProtocol, str] = {}
        # Store chat history for each client: {client_id: [messages]}
        self.chat_history: Dict[str, list] = {}
        # Initialize chat with system prompt
        self.system_prompt = SYSTEM_PROMPT
        
    async def register(self, websocket: websockets.WebSocketServerProtocol):
        """Register a new client connection"""
        client_id = str(uuid.uuid4())
        self.clients[websocket] = client_id
        
        # Clear chat history for this client
        if client_id in self.chat_history:
            del self.chat_history[client_id]
        self.chat_history[client_id] = []
        
        print(f"Client connected: {client_id}")
        
        # Send welcome message
        await websocket.send(json.dumps({
            "type": "system",
            "text": "Connected to chat server. How can I help you today?",
            "timestamp": None  # Frontend will add timestamp
        }))

    async def unregister(self, websocket: websockets.WebSocketServerProtocol):
        """Unregister a client connection and clear their chat history"""
        try:
            client_id = self.clients[websocket]
            print(f"Client disconnected: {client_id}")
            
            # Clear chat history for this client
            if client_id in self.chat_history:
                del self.chat_history[client_id]
            
            # Remove from clients list
            del self.clients[websocket]
            
            # Send system message to all other clients
            for client_websocket in self.clients:
                try:
                    await client_websocket.send(json.dumps({
                        "type": "system",
                        "text": f"Client {client_id} has disconnected",
                        "timestamp": None
                    }))
                except websockets.ConnectionClosed:
                    continue
        except Exception as e:
            print(f"Error unregistering client: {e}")

    async def get_ai_response_streaming(self, client_id: str, user_message: str, websocket: websockets.WebSocketServerProtocol) -> None:
        """Get streaming response from Gemini AI"""
        try:
            # Add user message to history
            self.chat_history[client_id].append({
                "role": "user",
                "parts": [user_message]
            })

            # Notify client that streaming is starting
            print("Sending stream_start event")
            await websocket.send(json.dumps({
                "type": "stream_start"
            }))

            # Get streaming response from Gemini
            response_text = ""
            
            # Start generation with streaming
            generation_config = {
                "temperature": 0.7,
                "top_p": 0.8,
                "top_k": 40,
                "max_output_tokens": 2048,
            }
            
            # Get response from Gemini with streaming
            response = model.generate_content(
                user_message,
                generation_config=generation_config,
                stream=True
            )
            
            # Process the streaming response correctly
            for chunk in response:
                # Wait a bit between chunks to prevent overwhelming the client
                await asyncio.sleep(0.01)
                
                # Extract text from the chunk
                if hasattr(chunk, 'text') and chunk.text:
                    chunk_text = chunk.text
                    
                    # Send chunk to client
                    try:
                        print(f"Sending chunk: {chunk_text[:20]}...")
                        await websocket.send(json.dumps({
                            "type": "stream_content",
                            "content": chunk_text
                        }))
                        response_text += chunk_text
                    except websockets.ConnectionClosed:
                        print("Connection closed during streaming")
                        await self.unregister(websocket)
                        return

            # Signal end of streaming
            print("Sending stream_end event")
            try:
                await websocket.send(json.dumps({
                    "type": "stream_end"
                }))
            except websockets.ConnectionClosed:
                await self.unregister(websocket)
                return

            # Add final response to history
            self.chat_history[client_id].append({
                "role": "model",
                "parts": [response_text]
            })
            print(f"Complete response added to history: {response_text[:50]}...")

        except Exception as e:
            print(f"Error getting AI response: {e}")
            import traceback
            traceback.print_exc()
            
            # Signal streaming end in case of error
            try:
                await websocket.send(json.dumps({
                    "type": "stream_end"
                }))
                
                # Send error message
                error_message = {
                    "type": "received",
                    "text": f"I apologize, but I encountered an error processing your request: {str(e)}. Please try again.",
                    "timestamp": None,
                    "isAI": True
                }
                await websocket.send(json.dumps(error_message))
            except websockets.ConnectionClosed:
                await self.unregister(websocket)

    async def handle_message(self, websocket: websockets.WebSocketServerProtocol, message: dict):
        """Handle incoming message and get AI response"""
        client_id = self.clients[websocket]
        user_text = message.get("text", "")
        print(f"Handling message from client {client_id}: {user_text[:50]}...")

        if not user_text.strip():
            print("Empty message received, ignoring")
            return

        # Get AI response with streaming
        await self.get_ai_response_streaming(client_id, user_text, websocket)

    async def handle_connection(self, websocket: websockets.WebSocketServerProtocol):
        """Handle a client connection"""
        await self.register(websocket)
        try:
            async for message in websocket:
                try:
                    print(f"Received message: {message}")
                    data = json.loads(message)
                    print(f"Parsed data: {data}")
                    await self.handle_message(websocket, data)
                except json.JSONDecodeError as e:
                    print(f"Invalid JSON received: {message}")
                    print(f"Error details: {e}")
                    # Send error message to client
                    await websocket.send(json.dumps({
                        "type": "system",
                        "text": "Invalid message format received. Please try again.",
                        "timestamp": None
                    }))
        except websockets.ConnectionClosed as e:
            print(f"Connection closed: {e}")
        except Exception as e:
            print(f"Unexpected error in connection handler: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await self.unregister(websocket)

async def main():
    chat_server = ChatServer()
    
    # Allow connections from any origin for development 
    # (you might want to restrict this in production)
    async with websockets.serve(
        chat_server.handle_connection, 
        "localhost", 
        8080,
        ping_interval=None  # Disable ping to prevent timeouts during long generations
    ):
        print("Chat server started on ws://localhost:8080")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())