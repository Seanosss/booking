#!/usr/bin/env node

require('dotenv').config();

const { initializeDatabase, pool } = require('../db');

(async () => {
    try {
        await initializeDatabase();
        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('Database initialization failed:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
