#!/usr/bin/env node

require('dotenv').config();

const { initializeDatabase, pool } = require('../db');

(async () => {
    try {
        await initializeDatabase();
        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('⚠️ Database initialization failed (Non-fatal for static site):', error);
        // Do NOT fail the build/start process. Allow server to try starting.
        process.exitCode = 0;
    } finally {
        await pool.end();
    }
})();
