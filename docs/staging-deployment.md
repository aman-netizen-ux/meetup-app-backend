# Free staging deployment

This guide deploys the Node API as a **staging** service with Render's free web service and Neon free PostgreSQL. It is intended for development, demonstrations, and device testing. It is not a production availability plan: a free Render service can sleep while idle, so the first request after sleep can be slow and the in-process minute lifecycle scheduler cannot run while it is asleep.

## What is deployed

- Render builds [Dockerfile](../Dockerfile), runs compiled migrations with an advisory lock, then starts the Fastify server.
- Neon supplies the PostgreSQL database. Its connection string is stored only as a Render secret.
- Firebase Authentication and Cloud Messaging remain in the existing Firebase project.
- The Flutter application receives only the public HTTPS API URL. It never receives database, Geoapify, or Firebase Admin credentials.

## Create the services

1. Create a Neon project and database in the region closest to Bengaluru. Copy its pooled PostgreSQL connection string with SSL required.
2. In Render, choose **New > Blueprint**, connect `meetup-app-backend`, and select its `main` branch. Render reads [render.yaml](../render.yaml).
3. In the service's environment settings, add these secrets:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | The complete Neon connection string. |
   | `FIREBASE_PROJECT_ID` | The existing Firebase project ID. |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | The complete content of a Firebase Admin service-account JSON file, pasted as one secret value. |
   | `GEOAPIFY_API_KEY` | The existing server-side Geoapify key. |
   | `INVITATION_BASE_URL` | Keep `meetup://join` for this development build. Replace with the final HTTPS join prefix only after F-06's verified domain setup. |

   `FIREBASE_SERVICE_ACCOUNT_JSON` exists only in Render's encrypted environment. It must never be committed, copied to Flutter, or placed in the Docker build context. The runtime accepts a host-attached Google credential as well, so local development can continue using `GOOGLE_APPLICATION_CREDENTIALS`.

4. Deploy. The service runs `npm run migrate:production` before `npm start`; the advisory lock prevents competing releases from applying the same migration together.
5. Open `https://<render-service>.onrender.com/health`. A healthy response confirms the container is reachable. Then use a Firebase-authenticated app request to verify the database and Admin credential.
6. Copy the Render HTTPS URL into the ignored Flutter `config/app.local.json` `API_BASE_URL`, rebuild the debug APK, and verify sign-in, circle load, place search, and one push notification.

## Rollback and restore

1. If a release fails its health check, use Render's previous successful deploy and select **Rollback**. Do not change app configuration until `/health` is green again.
2. Database migrations are forward-only. Before any destructive schema change, take a Neon restore point or SQL backup. A code rollback is safe only when the previous code supports the already-applied schema.
3. For a compromised secret, rotate it at Firebase, Geoapify, or Neon first, update the Render secret, then redeploy. Never solve this by committing a replacement key.
4. Keep the local Podman database separate from staging. Do not point local migration commands at staging without a backup and an explicit maintenance decision.

## Required production follow-up

- Move off the free sleeping service and use a reliable scheduler before promising scheduled-circle timing.
- Replace the process-local event broker before scaling beyond one API instance.
- Complete F-06 with an owned HTTPS domain, Android App Links, and iOS Universal Links.
- Complete B-14 and F-15 release checks, including multi-device and iOS testing.
