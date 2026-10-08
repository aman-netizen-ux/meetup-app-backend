import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';

/** Creates the Firebase Admin app from a host identity or deployment secret. */
export class FirebaseAdminAppProvider {
  getApp(projectId: string): App {
    return getApps()[0] ?? initializeApp({
      credential: this.getCredential(),
      projectId,
    });
  }

  private getCredential() {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) return applicationDefault();

    try {
      return cert(JSON.parse(serviceAccountJson));
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.');
    }
  }
}
