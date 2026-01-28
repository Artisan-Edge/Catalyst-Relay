/**
 * Auto-refresh timer management
 */

import type { Session } from '../../../core/session/types';
import type { RefreshResult } from '../../../core/session/refresh';
import type { AsyncResult } from '../../../types/result';
import { debug } from '../../../core/utils';

export interface AutoRefreshManager {
    start: (intervalMs: number) => void;
    stop: () => void;
}

export function createAutoRefresh(
    getSession: () => Session | null,
    refreshSession: () => AsyncResult<RefreshResult>
): AutoRefreshManager {
    let timer: ReturnType<typeof setInterval> | null = null;

    return {
        start(intervalMs: number) {
            this.stop();
            timer = setInterval(async () => {
                if (!getSession()) return;
                const [, refreshErr] = await refreshSession();
                if (refreshErr) {
                    debug(`Auto-refresh failed: ${refreshErr.message}`);
                }
            }, intervalMs);
            // Don't keep the process alive just for auto-refresh
            // This allows CLI commands to exit naturally after completing their work
            timer.unref();
        },
        stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }
    };
}
