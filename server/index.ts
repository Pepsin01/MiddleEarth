import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, config.host, () => {
  console.log(`Middle-earth Chronicle is listening on http://${config.host}:${config.port}`);
  console.log(`  data folder : ${config.dataDir}`);
  if (config.readOnly) {
    console.log('  editing     : disabled (READ_ONLY)');
  } else if (config.adminPassword) {
    console.log('  editing     : password protected');
  } else {
    console.log('  editing     : OPEN to everyone who can reach this address (set ADMIN_PASSWORD to protect it)');
  }
});
