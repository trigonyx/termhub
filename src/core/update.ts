import { createUpdater } from 'termcore/app/update';
import { APP } from '../app.js';

export { compareVersions, requestRestart, restartRequested } from 'termcore/app/update';

/** Update check and install for termhub itself (TERMHUB_NO_UPDATE_CHECK, _UPDATE_URL, _INSTALL_SPEC, _APP_DIR). */
export const self = createUpdater(APP);
