import express from 'express';
import SSE from 'express-sse';
import { connect, StringCodec } from 'nats';
import fs from 'fs/promises';
import https from 'https';
import { readFileSync } from 'fs';
import fetch from 'node-fetch'; // <-- added

const app = express();
const sse = new SSE();

const PORT = 443;
const PRICE_FILE = 'price';

const options = {
  cert: readFileSync('/certs/fullchain.pem'),
  key: readFileSync('/certs/privkey.pem'),
};

// GeoIP lookup on startup
let SERVER_GEO = { lat: null, lon: null }; // <-- added
try {
  const res = await fetch('http://ip-api.com/json');
  const json = await res.json();
  SERVER_GEO = { lat: json.lat, lon: json.lon };
  console.log('Server geo detected:', SERVER_GEO);
} catch (err) {
  console.error('GeoIP lookup failed:', err);
}

app.get('/sse', sse.init);

app.get('/price', async (req, res) => {
  try {
    const data = await fs.readFile(PRICE_FILE, 'utf8');
    res.type('application/json').send(data);
  } catch (err) {
    console.error('Error reading price file:', err);
    res.status(500).send({ error: 'Could not read price file' });
  }
});

https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS server running on https://localhost:${PORT}`);
});

const nc = await connect({ servers: 'nats://host.docker.internal:4222' });
console.log('Connected to NATS');

const sc = StringCodec();
const sub = nc.subscribe('price');
console.log('Subscribed to subject "price"');

for await (const msg of sub) {
  try {
    const decoded = sc.decode(msg.data);
    const parsed = JSON.parse(decoded);

    // Flatten nested .data object
    if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object') {
      Object.assign(parsed, parsed.data);
      delete parsed.data;
    }

    // Add geo field with lat/lon from startup lookup
    parsed.geo = SERVER_GEO; // <-- added

    const jsonString = JSON.stringify(parsed);

    await fs.writeFile(PRICE_FILE, jsonString, 'utf8');
    sse.send(parsed);
    console.log('Broadcast + file updated:', parsed);
  } catch (err) {
    console.error('Error processing message:', err);
  }
}
