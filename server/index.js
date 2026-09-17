import express from "express";
import cors from "cors";
import http from "http";
import crypto from "crypto";
import { Server } from "socket.io";
import admin from "firebase-admin";

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000,
});

const users = new Map();
const waiting = { male: [], female: [] };
const DEFAULT_SCHEDULE = {
  enabled: true,
  openingTime: "21:00",
  closingTime: "04:00",
  timezone: "Asia/Kolkata",
  message: "OffCampus is available from 9:00 PM to 4:00 AM.",
};

let schedule = { ...DEFAULT_SCHEDULE };
let firestore = null;

function initFirebaseAdmin() {
  if (admin.apps.length) {
    firestore = admin.firestore();
    return;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.warn("FIREBASE_SERVICE_ACCOUNT_JSON is not configured. Admin settings will be unavailable until it is added.");
    return;
  }

  try {
    const credentials = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(credentials) });
    firestore = admin.firestore();
    console.log("Firebase Admin initialized");
  } catch (error) {
    console.error("Firebase Admin initialization failed:", error.message);
  }
}

initFirebaseAdmin();

async function loadSchedule() {
  if (!firestore) return schedule;
  try {
    const snap = await firestore.collection("offcampus_config").doc("accessSchedule").get();
    if (snap.exists) schedule = { ...DEFAULT_SCHEDULE, ...snap.data() };
  } catch (error) {
    console.error("Failed to load access schedule:", error.message);
  }
  return schedule;
}

function timeToMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getCurrentMinutes(timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

function isScheduleOpen(current = schedule) {
  if (!current.enabled) return false;

  const opening = timeToMinutes(current.openingTime);
  const closing = timeToMinutes(current.closingTime);
  const now = getCurrentMinutes(current.timezone);
  if (opening === null || closing === null || now === null) return false;

  if (opening === closing) return true;
  if (opening < closing) return now >= opening && now < closing;
  return now >= opening || now < closing;
}

async function getAccessStatus() {
  const current = await loadSchedule();
  return { open: isScheduleOpen(current), schedule: current };
}

async function disconnectForMaintenance() {
  const status = await getAccessStatus();
  if (status.open) return;

  for (const socket of io.sockets.sockets.values()) {
    socket.emit("maintenance", { schedule: status.schedule });
    socket.disconnect(true);
  }

  if (users.size) {
    users.clear();
    waiting.male = [];
    waiting.female = [];
    broadcastActiveUsers();
  }
}

async function requireAdmin(req, res, next) {
  if (!admin.apps.length || !firestore) {
    return res.status(503).json({ error: "Admin authentication is not configured on the server." });
  }

  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required." });

  try {
    const token = header.slice(7).trim();
    const decoded = await admin.auth().verifyIdToken(token);
    const allowedEmails = String(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (!decoded.email || !decoded.email_verified || !allowedEmails.includes(decoded.email.toLowerCase())) {
      return res.status(403).json({ error: "Admin access denied." });
    }

    req.admin = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (error) {
    console.warn("Admin token rejected:", error.message);
    return res.status(401).json({ error: "Invalid or expired admin session." });
  }
}


const cleanGender = (value) => value === "female" ? "female" : "male";
const newMatchId = () => crypto.randomUUID();

function broadcastActiveUsers() {
  io.emit("active-users", users.size);
}

function removeFromQueue(id) {
  for (const gender of ["male", "female"]) {
    waiting[gender] = waiting[gender].filter((x) => x !== id);
  }
}

function emitMediaState(id) {
  const user = users.get(id);
  if (!user?.partnerId || !user.matchId) return;

  const partner = users.get(user.partnerId);
  if (!partner || partner.partnerId !== id || partner.matchId !== user.matchId) return;

  io.to(user.partnerId).emit("media-state", {
    from: id,
    camera: user.media.camera,
    mic: user.media.mic,
    matchId: user.matchId,
  });
}

function clearMatch(id, notify = true) {
  const user = users.get(id);
  if (!user) return null;

  const partnerId = user.partnerId;
  const oldMatchId = user.matchId;

  user.partnerId = null;
  user.matchId = null;
  user.state = "idle";

  if (partnerId) {
    const partner = users.get(partnerId);
    if (partner && partner.partnerId === id && partner.matchId === oldMatchId) {
      partner.partnerId = null;
      partner.matchId = null;
      partner.state = "idle";
      if (notify) {
        io.to(partnerId).emit("partner-left", {
          matchId: oldMatchId,
          partnerId: id,
        });
      }
    }
  }

  return partnerId;
}

function findPartner(id) {
  const user = users.get(id);
  if (!user) return null;

  removeFromQueue(id);

  const opposite = user.profile.gender === "male" ? "female" : "male";
  const same = user.profile.gender;

  const pick = (gender) => {
    while (waiting[gender].length) {
      const candidateId = waiting[gender].shift();
      const candidate = users.get(candidateId);
      if (!candidate || candidateId === id || candidate.partnerId || candidate.state !== "searching") continue;
      return candidateId;
    }
    return null;
  };

  const partnerId = pick(opposite) ?? pick(same);

  if (!partnerId) {
    if (!waiting[user.profile.gender].includes(id)) waiting[user.profile.gender].push(id);
    user.state = "searching";
    io.to(id).emit("searching");
    return null;
  }

  const partner = users.get(partnerId);
  if (!partner) return findPartner(id);

  const matchId = newMatchId();
  user.partnerId = partnerId;
  partner.partnerId = id;
  user.matchId = matchId;
  partner.matchId = matchId;
  user.state = "matched";
  partner.state = "matched";

  io.to(id).emit("matched", {
    matchId,
    partnerId,
    partner: partner.profile,
    partnerMedia: partner.media,
  });

  io.to(partnerId).emit("matched", {
    matchId,
    partnerId: id,
    partner: user.profile,
    partnerMedia: user.media,
  });

  // Authoritative state immediately after matching. This removes the race
  // between the matched event and the first media-state packet.
  emitMediaState(id);
  emitMediaState(partnerId);

  return partnerId;
}

function startSearching(id) {
  const user = users.get(id);
  if (!user) return;

  removeFromQueue(id);
  if (user.partnerId) clearMatch(id, true);
  user.state = "searching";
  findPartner(id);
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "offcampus-backend" });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "offcampus-backend",
    users: users.size,
    waiting: waiting.male.length + waiting.female.length,
  });
});

app.get("/api/access-status", async (_req, res) => {
  const status = await getAccessStatus();
  res.set("Cache-Control", "no-store");
  res.json(status);
});

app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
  const status = await getAccessStatus();
  res.set("Cache-Control", "no-store");
  res.json({ schedule: status.schedule, status: { open: status.open } });
});

app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const openingTime = String(req.body?.openingTime || "");
  const closingTime = String(req.body?.closingTime || "");
  const timezone = "Asia/Kolkata";
  const message = String(req.body?.message || DEFAULT_SCHEDULE.message).trim().slice(0, 200);

  if (timeToMinutes(openingTime) === null || timeToMinutes(closingTime) === null) {
    return res.status(400).json({ error: "Opening and closing times must be valid 24-hour times." });
  }

  const nextSchedule = { enabled, openingTime, closingTime, timezone, message };

  try {
    await firestore.collection("offcampus_config").doc("accessSchedule").set({
      ...nextSchedule,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: _req.admin.email,
    }, { merge: true });

    schedule = nextSchedule;
    const status = await getAccessStatus();
    if (!status.open) await disconnectForMaintenance();

    res.set("Cache-Control", "no-store");
    res.json({ schedule, status: { open: status.open } });
  } catch (error) {
    console.error("Failed to save access schedule:", error.message);
    res.status(500).json({ error: "Could not save the schedule." });
  }
});

io.use(async (_socket, next) => {
  try {
    const status = await getAccessStatus();
    if (!status.open) {
      const error = new Error("MAINTENANCE");
      error.data = { schedule: status.schedule };
      return next(error);
    }
    next();
  } catch (error) {
    next(error);
  }
});

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("profile", (profile) => {
    const name = String(profile?.name || "Student").trim().slice(0, 30) || "Student";
    const gender = cleanGender(profile?.gender);

    users.set(socket.id, {
      profile: { name, gender },
      partnerId: null,
      matchId: null,
      state: "idle",
      media: { camera: false, mic: false },
    });

    socket.emit("ready");
    broadcastActiveUsers();
  });

  socket.on("find", () => {
    if (!users.has(socket.id)) return;
    startSearching(socket.id);
  });

  socket.on("next", () => {
    const user = users.get(socket.id);
    if (!user) return;

    console.log("NEXT", socket.id);
    clearMatch(socket.id, true);
    removeFromQueue(socket.id);

    user.state = "searching";
    findPartner(socket.id);
  });

  socket.on("signal", ({ to, data, matchId, generation }) => {
    const sender = users.get(socket.id);
    const target = users.get(to);

    if (!sender || !target || !sender.partnerId || sender.partnerId !== to) return;
    if (!sender.matchId || sender.matchId !== matchId || target.matchId !== matchId) return;

    io.to(to).emit("signal", {
      from: socket.id,
      data,
      matchId,
      generation,
    });
  });

  socket.on("media-state", (state) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Once matched, every media packet must belong to the current match.
    // This prevents delayed packets from an older chat changing the new chat UI.
    if (user.matchId && state?.matchId !== user.matchId) return;
    if (state?.matchId && !user.matchId) return;

    user.media = {
      camera: typeof state?.camera === "boolean" ? state.camera : user.media.camera,
      mic: typeof state?.mic === "boolean" ? state.mic : user.media.mic,
    };

    // Keep the latest state for the next match even while searching/idle.
    if (!user.partnerId || !user.matchId) return;

    emitMediaState(socket.id);

    io.to(socket.id).emit("media-state-self", {
      camera: user.media.camera,
      mic: user.media.mic,
      matchId: user.matchId,
    });
  });

  // Dedicated camera-state channel. The UI uses this as the authoritative
  // camera toggle signal because browser WebRTC mute events are not reliable
  // enough to drive UI state on every mobile/desktop browser.
  socket.on("camera-state", (state) => {
    const user = users.get(socket.id);
    if (!user) return;

    if (!user.partnerId || !user.matchId) return;
    if (state?.matchId !== user.matchId) return;
    if (typeof state?.camera !== "boolean") return;

    user.media.camera = state.camera;

    const partner = users.get(user.partnerId);
    if (!partner || partner.partnerId !== socket.id || partner.matchId !== user.matchId) return;

    io.to(user.partnerId).emit("peer-media-state", {
      from: socket.id,
      camera: user.media.camera,
      mic: user.media.mic,
      matchId: user.matchId,
    });

    io.to(socket.id).emit("media-state-self", {
      camera: user.media.camera,
      mic: user.media.mic,
      matchId: user.matchId,
    });
  });

  socket.on("chat", ({ text }) => {
    const user = users.get(socket.id);
    if (!user?.partnerId || !user.matchId) return;

    const message = String(text || "").trim().slice(0, 1000);
    if (!message) return;

    io.to(user.partnerId).emit("chat", {
      text: message,
      matchId: user.matchId,
    });
  });

  socket.on("typing", ({ typing, matchId }) => {
    const user = users.get(socket.id);
    if (!user?.partnerId || !user.matchId) return;
    if (matchId !== user.matchId) return;

    io.to(user.partnerId).emit("typing", {
      typing: Boolean(typing),
      matchId: user.matchId,
    });
  });

  socket.on("report", ({ reason }) => {
    const user = users.get(socket.id);
    if (!user) return;

    console.log("REPORT", socket.id, reason || "User report");
    clearMatch(socket.id, true);
    startSearching(socket.id);
  });

  socket.on("block", () => {
    const user = users.get(socket.id);
    if (!user) return;

    clearMatch(socket.id, true);
    socket.emit("blocked");
    startSearching(socket.id);
  });

  socket.on("leave", () => {
    if (!users.has(socket.id)) return;

    removeFromQueue(socket.id);
    clearMatch(socket.id, true);
    users.delete(socket.id);
    broadcastActiveUsers();
    console.log("socket left", socket.id);
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    clearMatch(socket.id, true);
    users.delete(socket.id);
    broadcastActiveUsers();
    console.log("socket disconnected", socket.id);
  });
});

// Re-check periodically so a schedule closing during an active chat is enforced server-side.
setInterval(() => {
  disconnectForMaintenance().catch((error) => console.error("Maintenance check failed:", error.message));
}, 30000);

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`OffCampus server listening on port ${PORT}`);
});
