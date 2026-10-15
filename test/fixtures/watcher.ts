// A second process (like a running app): opens the shared data and prints every change it sees.
import { basePaths } from 'termcore/app/paths';
import { Hub } from 'termcore/store/hub';

const home = process.argv[2]!;
const hub = new Hub(basePaths('termdrop', home, {}).hub);
const print = () =>
  process.stdout.write(JSON.stringify({ name: hub.me.name, color: hub.me.color ?? null, status: hub.me.status, accent: hub.settings.get().accent ?? null, animations: hub.settings.get().animations }) + '\n');
hub.profile.on('change', print);
hub.settings.on('change', print);
hub.watch();
print();
setTimeout(() => process.exit(0), 20_000);
