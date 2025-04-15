// Chat UI elements
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectButton = document.getElementById('connect-button');

// WebSocket connection
let ws = null;
let isConnected = false;

// Message history management
let messageHistory = [];

// Streaming message handling
let currentStreamingMessage = null;
let isStreaming = false;
let messageBuffer = '';

// Initialize the chat interface
function initChat() {
    // Load saved messages
    chrome.storage.local.get(['messages'], (result) => {
        messageHistory = result.messages || [];
        messageHistory.forEach(message => displayMessage(message));
    });

    // Set up event listeners
    messageInput.addEventListener('keypress', handleKeyPress);
    sendButton.addEventListener('click', sendMessage);
    connectButton.addEventListener('click', toggleConnection);
    
    // Initialize connection
    connectWebSocket();
}

// Handle Enter key press
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Connect to WebSocket
async function connectWebSocket() {
    try {
        ws = new WebSocket('ws://localhost:8080');
        
        ws.onopen = () => {
            isConnected = true;
            connectButton.textContent = 'Disconnect';
            displaySystemMessage('Connected to chat server');
            
            // Clear chat container and message history on connect
            chatContainer.innerHTML = '';
            messageHistory = [];
            saveMessageHistory();
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
                displaySystemMessage('Error processing server response');
            }
        };

        ws.onclose = () => {
            isConnected = false;
            ws = null;
            connectButton.textContent = 'Connect';
            displaySystemMessage('Disconnected from chat server');
            
            // Clear chat container and message history on disconnect
            chatContainer.innerHTML = '';
            messageHistory = [];
            saveMessageHistory();
            
            // Clear streaming state if disconnected during streaming
            if (isStreaming) {
                finishStreamingMessage();
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            displaySystemMessage('WebSocket error occurred');
            
            // Clear chat container and message history on error
            chatContainer.innerHTML = '';
            messageHistory = [];
            saveMessageHistory();
        };
    } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        displaySystemMessage('Failed to connect to chat server');
        
        // Clear chat container and message history on connection failure
        chatContainer.innerHTML = '';
        messageHistory = [];
        saveMessageHistory();
    }
}

// Handle server messages
function handleServerMessage(data) {
    // Handle different message types
    if (data.type === 'stream_start') {
        // Start streaming message
        startStreamingMessage();
    } else if (data.type === 'stream_content') {
        // Handle streaming content chunk
        appendStreamContent(data.content);
    } else if (data.type === 'stream_end') {
        // End streaming message
        finishStreamingMessage();
        enableInput();
    } else {
        // Handle regular (non-streaming) messages
        const typingIndicator = document.querySelector('.typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        
        displayMessage(data);
        
        if (data.isAI) {
            enableInput();
        }
    }
}

// Start a new streaming message
function startStreamingMessage() {
    // Remove typing indicator if present
    const typingIndicator = document.querySelector('.typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
    
    isStreaming = true;
    messageBuffer = '';
    
    // Create a new message element for streaming content
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'received', 'streaming');
    
    // Create message content
    const content = document.createElement('div');
    content.classList.add('message-content');
    
    // Create message text element
    const text = document.createElement('div');
    text.classList.add('message-text');
    content.appendChild(text);
    
    // Add AI badge
    const badge = document.createElement('span');
    badge.classList.add('ai-badge');
    badge.textContent = 'AI';
    content.appendChild(badge);
    
    messageElement.appendChild(content);
    chatContainer.appendChild(messageElement);
    
    // Store reference to current streaming message
    currentStreamingMessage = messageElement;
}

// Append content to the current streaming message
function appendStreamContent(content) {
    if (!isStreaming || !currentStreamingMessage) return;
    
    // Add new content to buffer
    messageBuffer += content;
    
    // Format and display the updated message
    const textElement = currentStreamingMessage.querySelector('.message-text');
    
    // Process text with markdown formatting
    let formattedText = messageBuffer;
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold text
    formattedText = formattedText.replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic text
    formattedText = formattedText.replace(/(\d+)\.\s(.*?)(?=\n|$)/g, '<br>$1. $2'); // Numbered lists
    formattedText = formattedText.replace(/\n/g, '<br>'); // Line breaks
    
    textElement.innerHTML = formattedText;
    
    // Scroll to the bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Finish streaming message and save to history
function finishStreamingMessage() {
    if (!isStreaming || !currentStreamingMessage) return;
    
    // Create complete message object
    const message = {
        text: messageBuffer,
        type: 'received',
        isAI: true,
        timestamp: new Date().toISOString()
    };
    
    // Update streaming status
    isStreaming = false;
    currentStreamingMessage.classList.remove('streaming');
    currentStreamingMessage = null;
    
    // Save message to history
    messageHistory.push(message);
    saveMessageHistory();
}

// Display message in chat container
function displayMessage(message) {
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', message.type);
    
    // Create message content
    const content = document.createElement('div');
    content.classList.add('message-content');
    
    // Create message text with markdown support
    const text = document.createElement('div');
    text.classList.add('message-text');
    
    // Process text with markdown formatting
    let formattedText = message.text;
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold text
    formattedText = formattedText.replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic text
    formattedText = formattedText.replace(/(\d+)\.\s(.*?)(?=\n|$)/g, '<br>$1. $2'); // Numbered lists
    formattedText = formattedText.replace(/\n/g, '<br>'); // Line breaks
    
    text.innerHTML = formattedText;
    content.appendChild(text);
    
    // Add AI badge for AI messages
    if (message.isAI) {
        const badge = document.createElement('span');
        badge.classList.add('ai-badge');
        badge.textContent = 'AI';
        content.appendChild(badge);
    }
    
    messageElement.appendChild(content);
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Save message to history if not a system message
    if (message.type !== 'system') {
        messageHistory.push(message);
        saveMessageHistory();
    }
}

// Display system message
function displaySystemMessage(text) {
    const message = {
        text,
        type: 'system',
        timestamp: new Date().toISOString()
    };
    displayMessage(message);
}

// Save message history to storage
function saveMessageHistory() {
    chrome.storage.local.set({ messages: messageHistory });
}

// Send message to server
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    // Create message object
    const message = {
        text,
        type: 'sent',
        timestamp: new Date().toISOString()
    };

    // Display sent message
    displayMessage(message);
    
    // Send to server
    ws.send(JSON.stringify(message));
    
    // Disable input and show typing indicator
    disableInput();
    displayTypingIndicator();
    
    // Clear input
    messageInput.value = '';
}

// Display typing indicator
function displayTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.classList.add('message', 'received', 'typing-indicator');
    indicator.innerHTML = '<span>AI is typing</span><span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    chatContainer.appendChild(indicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Enable input
function enableInput() {
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
}

// Disable input
function disableInput() {
    messageInput.disabled = true;
    sendButton.disabled = true;
}

// Toggle connection
function toggleConnection() {
    if (isConnected) {
        ws.close();
    } else {
        connectWebSocket();
    }
}

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', initChat);