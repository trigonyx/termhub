import { lastSeen } from 'termcore/ui/format';
import type { FriendView } from '../core/store.js';

/** "termchat · keyrace" – the apps someone is online in. */
export const appsLabel = (apps: string[]) => apps.join(' · ');

/** What a friend's row says after the name. */
export function presenceLine(f: FriendView, now = Date.now()): string {
  switch (f.state) {
    case 'outgoing':
      return 'request sent';
    case 'declined':
      return 'declined your request';
    case 'blocked':
      return 'blocked';
    case 'incoming':
      return 'wants to be friends';
    default:
      return f.online ? appsLabel(f.apps) : lastSeen(f.lastSeen, now);
  }
}
