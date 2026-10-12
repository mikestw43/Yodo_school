import { PORT } from './lib/config.js';
import { createApp } from './app.js';
import { ensureSetupCode } from './routes/auth.js';
import { scheduleDailyBackup } from './lib/backup.js';
import { scheduleExpiryCheck } from './lib/notify.js';

await ensureSetupCode();
scheduleDailyBackup();
scheduleExpiryCheck();
createApp().listen(PORT, () => console.log(`YODO listening on :${PORT}`));
