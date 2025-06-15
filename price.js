import express from 'express';
import SSE from 'express-sse';
import { connect, StringCodec } from 'nats';
import fs from 'fs/promises';
import https from 'https';
import { readFileSync } from 'fs';

const app = express();
const sse = new SSE();

const PORT = 443;
const PRICE_FILE = 'price';

// TLS certificate and key
const options = {
  cert: readFileSync('/certs/fullchain.pem'),
  key: readFileSync('/certs/privkey.pem'),
};

// Serve SSE stream
app.get('/sse', sse.init);

// Serve latest price from file
app.get('/price', async (req, res) => {
  try {
    const data = await fs.readFile(PRICE_FILE, 'utf8');
    res.type('application/json').send(data);
  } catch (err) {
    console.error('Error reading price file:', err);
    res.status(500).send({ error: 'Could not read price file' });
  }
});

// Start HTTPS server
https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS server running on https://localhost:${PORT}`);
});

// Connect to NATS core
const nc = await connect({ servers: 'nats://host.docker.internal:4222' });
console.log('Connected to NATS');

const sc = StringCodec();
const sub = nc.subscribe('price');
console.log('📡 Subscribed to subject "price"`);

// Handle incoming NATS messages
for await (const msg of sub) {
  try {
    const decoded = sc.decode(msg.data);
    const parsed = JSON.parse(decoded);

    // Flatten nested .data object
    if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object') {
      Object.assign(parsed, parsed.data);
      delete parsed.data;
    }

    const jsonString = JSON.stringify(parsed);

    // Overwrite the 'price' file
    await fs.writeFile(PRICE_FILE, jsonString, 'utf8');

    // Send update to SSE clients
    sse.send(parsed);

    console.log('Broadcast + file updated:', parsed);
  } catch (err) {
    console.error('Error processing message:', err);
  }
}
