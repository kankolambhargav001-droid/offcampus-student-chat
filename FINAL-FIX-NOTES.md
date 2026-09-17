# OffCampus — Final Mobile Touch Fix

This build keeps the existing UI, matching, chat, camera/mic controls and WebRTC architecture.

Final fixes:
1. Mobile stacking-context fix: the Stranger panel and its full-screen overlays no longer sit above the floating You panel. This fixes Start/camera/mic/Next taps in normal mobile Chrome/Safari.
2. Non-interactive video/overlay layers use pointer-events:none so visual layers cannot steal taps from controls.
3. Socket `ready` cannot reset an already-started search to idle on slow mobile connections.
4. Queued WebRTC signals preserve the full signal envelope, including matchId, so early offers/answers are not discarded.
5. Reconnect/search intent and Next/Leave state are kept consistent.

Deployment:
- Replace the project with this archive.
- Keep client/.env.production pointing to the deployed Render backend.
- Run `npm install`, `npm --prefix client install`, `npm --prefix server install`.
- Run `npm run build`.
- Deploy Firebase Hosting with `firebase deploy --only hosting`.

Testing:
- Test normal mobile Chrome (Desktop site OFF).
- Test two real phones.
- Confirm Start is tappable before matching.
- Confirm camera/mic buttons are tappable.
- Confirm both users can see each other.
- Test camera OFF/ON, mic OFF/ON, Next, chat, Report and Block.
