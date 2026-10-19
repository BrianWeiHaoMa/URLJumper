// *Reset learned order* (G27): removes all learned usage. The key goes, rather than becoming an empty record:
// absent is what a profile that never used a mapping holds, and the next use or write starts it afresh (P3).
import type { ResetUsageReply } from '../requests';

export async function resetUsage(): Promise<ResetUsageReply> {
  await chrome.storage.local.remove('usage');
  return { kind: 'done' };
}
