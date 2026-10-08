import { createServer } from 'node:http';
import { createApp } from './src/app.js';

const port = Number(process.env.PORT) || 3000;
const server = createServer(createApp());
server.listen(port, () => console.log(`TAM.TV listening on http://localhost:${port}`));

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
