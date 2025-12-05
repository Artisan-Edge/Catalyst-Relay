/**
 * Session Management Example
 *
 * Demonstrates how to use the session management utilities
 */

import { session } from '../src/core';
import type { ClientConfig } from '../src/types';

// Create a session manager
const manager = new session.SessionManager({
    sessionTimeout: 3600,        // 1 hour
    samlSessionTimeout: 1800,    // 30 minutes
    cleanupInterval: 60,         // 1 minute
});

// Example client configuration
const config: ClientConfig = {
    url: 'https://sap-server:443',
    client: '100',
    auth: {
        type: 'basic',
        username: 'testuser',
        password: 'testpass',
    },
};

// Generate a config hash
const configHash = session.hashConnectionConfig(config);
console.log('Config hash:', configHash);

// Create a mock client
const mockClient = { user: 'testuser', connected: true };

// Register the client with the hash
manager.registerClient(configHash, mockClient);

// Check if client exists by hash
const existingClient = manager.getClientByHash(configHash);
console.log('Client found:', existingClient !== null);

// Create a session
const sessionId = manager.createSession(configHash, mockClient, 'basic');
console.log('Session created:', sessionId);

// Retrieve session
const sessionEntry = manager.getSession(sessionId);
console.log('Session entry:', sessionEntry);

// Refresh session
const refreshed = manager.refreshSession(sessionId);
console.log('Session refreshed:', refreshed);

// Start cleanup task
const cleanup = session.startCleanupTask(
    manager,
    manager.getConfig(),
    (sessionId, entry) => {
        console.log(`Session ${sessionId} expired for auth type: ${entry.authType}`);
    }
);

// Simulate some work
setTimeout(() => {
    console.log('Destroying session...');
    manager.destroySession(sessionId);

    // Stop cleanup task
    cleanup.stop();
    console.log('Cleanup stopped');
}, 2000);
