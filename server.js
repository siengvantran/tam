import { createApp } from './src/app.js';

const port = Number(process.env.PORT) || 3000;
const app = await createApp();
const server = app.listen(port, () => console.log(`TAM.TV on http://localhost:${port}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    server.close();
    await app.store.flush();
    process.exit(0);
  });
}
