# OffCampus — Student Random Chat

Final test build for the OffCampus student random video/text chat MVP.

## Local test

From this folder:

```powershell
npm install
npm --prefix client install
npm --prefix server install
npm run dev
```

Open `http://localhost:5173`.

Use two browser windows/devices to test matching.

## Production test architecture

- Frontend: Firebase Hosting
- Backend: Render Free Web Service
- Signaling: Socket.IO
- Media: WebRTC with public Google STUN servers
- Matching: in-memory server queue

### Render

Create a Web Service from this repository with:

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Plan: Free
- Health Check Path: `/api/health`

The server listens on `0.0.0.0` and uses Render's `PORT` environment variable.

### Firebase

Build the frontend:

```powershell
npm run build:client
```

Then:

```powershell
firebase use offcampus-student-chat
firebase deploy --only hosting
```

The frontend uses `VITE_SERVER_URL` if supplied; otherwise it uses the configured Render backend URL.

## Final behavior

- Local camera is mirrored.
- Remote camera is never mirrored.
- Camera/mic/Next controls are located on the user's own video panel.
- On mobile, the user's video floats over the stranger video and the controls remain inside the user's video.
- Turning the stranger's camera off shows a camera-off placeholder instead of a black frozen frame.
- Turning the stranger's camera back on restores the video.
- Next immediately closes the current WebRTC peer, clears old signaling state, and starts a fresh server-side search.
- Match IDs prevent old WebRTC/chat/media events from leaking into a new match.
- Camera and microphone permissions are retained between Next operations.
