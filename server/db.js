require('dotenv').config();
const dns = require('dns');
const net = require('net');

// Prefer IPv4 (some networks have no IPv6 route)
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(true);
net.setDefaultAutoSelectFamilyAttemptTimeout(500);

const { Pool } = require('pg');

module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
