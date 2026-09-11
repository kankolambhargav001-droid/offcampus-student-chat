import express from "express";
import cors from "cors";
import http from "http";
import crypto from "crypto";
import { Server } from "socket.io";

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

const cleanGender = (value) => value === "female" ? "female" : "male";
const newMatchId = () => crypto.randomUUID();

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
    console.log("socket left", socket.id);
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    clearMatch(socket.id, true);
    users.delete(socket.id);
    console.log("socket disconnected", socket.id);
  });
});

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`OffCampus server listening on port ${PORT}`);
});
