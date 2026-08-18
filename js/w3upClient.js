// js/w3upClient.js
// Legacy compatibility wrapper for the Lighthouse client-side auth flow.

import { connectLighthouseSession, restoreLighthouseSession } from './lighthouseStorage.js';

// Attempt to restore an existing Lighthouse session without prompting the user.
// Returns { client, spaceDid } if a previously-authorized session is found, otherwise null.
// The `silent` parameter suppresses the startup warning when no session exists yet.
export async function tryAutoRestoreW3upClient({ silent = false } = {}) {
  try {
    const session = await restoreLighthouseSession();
    if (!session) {
      if (!silent) console.warn('Lighthouse auto-restore: no cached session found.');
      return null;
    }
    return { client: session, spaceDid: session.publicKey };
  } catch (err) {
    if (!silent) console.warn('Lighthouse auto-restore failed:', err);
    return null;
  }
}

export async function connectW3upClient() {
  try {
    const session = await connectLighthouseSession();
    return { client: session, spaceDid: session.publicKey };
  } catch (err) {
    console.error('Error initializing Lighthouse session:', err);
    return null;
  }
}