import { initializeApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCIQeaL2aYNw-N7WCOeomqn8fGMW6A_TMU",
  authDomain: "aoe4-scanner.firebaseapp.com",
  projectId: "aoe4-scanner",
  storageBucket: "aoe4-scanner.firebasestorage.app",
  messagingSenderId: "321453296272",
  appId: "1:321453296272:web:ec5c2186bd7a9d923c6615",
  measurementId: "G-8WLV7XMXK1",
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
if (typeof window !== "undefined" && appCheckSiteKey) {
  try {
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // Development hot reload may attempt to initialize the existing App Check instance again.
  }
}

export const db = getFirestore(firebaseApp);
