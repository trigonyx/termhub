import pkg from '../package.json';
import { defineApp } from 'termcore/app/suite';

/** termhub as termcore sees it: name, protocol `termhub/1`, ports 5056/5057, `TERMHUB_*`, repo, version. */
export const APP = defineApp('termhub', pkg);
