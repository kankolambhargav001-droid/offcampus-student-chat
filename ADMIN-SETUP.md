# OffCampus Admin Portal Setup

The admin portal is available at `/admin` and controls the server-enforced student access schedule.

## 1. Enable Firebase Authentication

In the Firebase project used by OffCampus:

1. Open **Authentication** → **Sign-in method**.
2. Enable **Email/Password**.
3. Create the administrator user under **Users**.
4. Verify the administrator email address.

The admin email must also be present in the Render environment variable `ADMIN_EMAILS`.

## 2. Create Firestore

Create/enable a Firestore database in the same Firebase project. The server stores one protected configuration document:

`offcampus_config/accessSchedule`

The backend uses Firebase Admin SDK, so normal client Firestore rules do not grant admin access.

## 3. Create a Firebase service account

Firebase Console → **Project settings** → **Service accounts** → generate a new private key.

Do NOT put the downloaded JSON file into this project or GitHub.

On Render, add the JSON contents as the secret environment variable:

`FIREBASE_SERVICE_ACCOUNT_JSON`

Also add:

`ADMIN_EMAILS=your-admin-email@example.com`

For multiple administrators, separate emails with commas.

## 4. Install the new backend dependency

From the project root:

```powershell
npm --prefix server install
npm --prefix client install
```

The backend now uses `firebase-admin`.

## 5. Deploy backend

Push the project to the repository connected to Render. Render will run the existing `npm install` build command and start the server.

Make sure the two Render environment variables above are configured before testing `/admin`.

## 6. Deploy frontend

```powershell
npm run build
firebase deploy --only hosting
```

Then open:

`https://YOUR-DOMAIN/admin`

or the Firebase Hosting URL with `/admin`.

## 7. Set the schedule

The portal allows you to set:

- Opening time
- Closing time
- Maintenance message
- Schedule enabled/disabled

Times are stored and enforced as **Asia/Kolkata (IST)**.

A schedule such as **21:00 → 04:00** correctly crosses midnight:

- 8:59 PM — closed
- 9:00 PM — open
- 11:59 PM — open
- 12:01 AM — open
- 3:59 AM — open
- 4:00 AM — closed

The server is authoritative. The frontend maintenance screen is only the user-facing layer.

## Security notes

- Admin passwords are handled by Firebase Authentication; they are not stored by OffCampus.
- The backend verifies Firebase ID tokens and requires a verified email in `ADMIN_EMAILS`.
- Schedule writes require an authenticated admin token.
- The service-account secret is server-side only.
- Student Socket.IO connections are rejected while the service is outside the configured window.
- Active student connections are disconnected when the server detects that the service has entered maintenance.
- Never commit `FIREBASE_SERVICE_ACCOUNT_JSON` or a downloaded service-account JSON file.
