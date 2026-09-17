import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent } from "firebase/analytics";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MessageCircle,
  SkipForward,
  LogOut,
  X,
  Send,
  SwitchCamera,
} from "lucide-react";
import "./styles.css";
import { AdminPortal, MaintenanceScreen } from "./AdminPortal.jsx";

const firebaseConfig = {
  apiKey: "AIzaSyDsXisbhMGzMR9hkN3r525HS6SkhEQaCcs",
  authDomain: "offcampus-student-chat.firebaseapp.com",
  projectId: "offcampus-student-chat",
  storageBucket: "offcampus-student-chat.firebasestorage.app",
  messagingSenderId: "470373736264",
  appId: "1:470373736264:web:a42833795d0f96bdd31d7d",
  measurementId: "G-KTSCNKCKZ4",
};

const firebaseApp = initializeApp(firebaseConfig);

let analytics = null;
try {
  analytics = getAnalytics(firebaseApp);
} catch (error) {
  console.warn("Firebase Analytics unavailable:", error);
}

const track = (eventName, params = {}) => {
  try {
    if (analytics) logEvent(analytics, eventName, params);
  } catch (error) {
    console.warn("Analytics event failed:", eventName, error);
  }
};

// Local development: undefined makes Socket.IO connect to the current
// Vite origin, and vite.config.js proxies /socket.io to localhost:3001.
// Production: set VITE_SERVER_URL to the deployed backend URL.
const SERVER = import.meta.env.VITE_SERVER_URL || undefined;

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function Logo() {
  return (
    <div className="logo">
      <div className="logoMark" aria-hidden="true"><span /><i /></div>
      <strong>offcampus</strong>
    </div>
  );
}

function InfoModal({ type, onClose }) {
  const content = {
    faq: {
      title: "Frequently asked questions",
      items: [
        ["Is OffCampus free?", "Yes. OffCampus is designed for students to chat without creating an account."],
        ["Do you store my chats?", "No chat history is intended to be stored. Messages exist only for the active session."],
        ["How does matching work?", "OffCampus first looks for an available student of the opposite gender. If none is waiting, it falls back to a student of the same gender."],
        ["Can I leave a chat?", "Use Leave to exit completely or Next to leave the current person and find another match."],
      ],
    },
    guidelines: {
      title: "Community guidelines",
      items: [
        ["Be respectful", "Treat other students with respect. Harassment, threats and hateful behavior are not allowed."],
        ["Keep it appropriate", "Do not share sexual, exploitative or illegal content. Never pressure another person to reveal private information."],
        ["Protect privacy", "Do not share passwords, OTPs, financial information, exact addresses or other sensitive personal details."],
        ["Report & block", "Use Report or Block when someone violates the rules."],
      ],
    },
    terms: {
      title: "Terms of use",
      items: [
        ["Use responsibly", "You are responsible for what you say and do while using OffCampus."],
        ["No abuse", "Do not use the service for harassment, impersonation, scams, threats or illegal activity."],
        ["Service availability", "This project is an MVP and may experience outages, matching delays or connection problems."],
      ],
    },
    privacy: {
      title: "Privacy",
      items: [
        ["Minimal profile", "Your nickname and gender are used to create a temporary matching session."],
        ["Active chat", "Video/audio are exchanged directly between matched browsers when possible."],
        ["No history", "The MVP does not intentionally maintain a permanent chat history."],
      ],
    },
  };
  const data = content[type] || content.faq;

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="infoModal">
        <button className="modalClose" onClick={onClose} aria-label="Close"><X size={25} strokeWidth={2} /></button>
        <h2>{data.title}</h2>
        {data.items.map(([q, a], i) => (
          <div className="infoItem" key={i}><h3>{q}</h3><p>{a}</p></div>
        ))}
        <button className="primary modalDone" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

function Welcome({ onStart }) {
  useEffect(() => {
    track("offcampus_page_visit", { page: "welcome" });
  }, []);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("male");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }
    track("start_chat", { source: "welcome" });
    onStart({ name: cleanName, gender });
  };

  return (
    <div className="page welcomePage">
      <header className="top">
        <Logo />
        <nav>
          <button type="button" onClick={() => setInfo("faq")}>FAQ</button>
          <button type="button" onClick={() => setInfo("guidelines")}>Guidelines</button>
        </nav>
      </header>

      <main className="welcomeMain">
        <div className="hero">
          <h1>Talk to students! <span>👋</span></h1>
          <div className="bigLogo"><Logo /></div>
          <div className="tag">🎓 <span>for campus students</span></div>
          <p>Random video and text chat with people on campus.<br />No sign up, no history.</p>
        </div>

        <form className="card profileCard" onSubmit={submit}>
          <label>Your name</label>
          <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder="Enter a nickname" maxLength={30} autoComplete="off" />
          <label>I am</label>
          <div className="gender">
            <button type="button" className={gender === "male" ? "active" : ""} onClick={() => setGender("male")}>Male</button>
            <button type="button" className={gender === "female" ? "active" : ""} onClick={() => setGender("female")}>Female</button>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="primary">Start chatting</button>
          <small>
            By continuing you agree to our{" "}
            <button type="button" className="inlineLink" onClick={() => setInfo("terms")}>terms</button>,{" "}
            <button type="button" className="inlineLink" onClick={() => setInfo("privacy")}>privacy</button>{" "}
            and{" "}
            <button type="button" className="inlineLink" onClick={() => setInfo("guidelines")}>guidelines</button>.
          </small>
        </form>
        {info && <InfoModal type={info} onClose={() => setInfo(null)} />}
      </main>
    </div>
  );
}

function Chat({ profile, onLeave }) {
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const partnerRef = useRef(null);
  const matchIdRef = useRef(null);
  const generationRef = useRef(0);
  const pendingSignalsRef = useRef([]);
  const pendingCandidatesRef = useRef([]);
  const mountedRef = useRef(true);
  const creatingPeerRef = useRef(false);
  const startingRef = useRef(false);

  // Refs keep long-lived Socket.IO callbacks in sync with React state.
  // This prevents the mobile Start action from being reset by the `ready`
  // event when the socket finishes connecting after the user has started.
  const statusRef = useRef("idle");
  const wantSearchRef = useRef(false);

  const [status, setStatusState] = useState("idle");
  const setStatus = useCallback((value) => {
    statusRef.current = value;
    setStatusState(value);
  }, []);
  const [camera, setCamera] = useState(false);
  const [mic, setMic] = useState(false);
  const [remoteCamera, setRemoteCamera] = useState(null);
  const remoteCameraRef = useRef(null);
  const [remoteMic, setRemoteMic] = useState(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [remoteTrackMuted, setRemoteTrackMuted] = useState(false);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [nextBusy, setNextBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [activeUsers, setActiveUsers] = useState(0);
  const [localCameraFacing, setLocalCameraFacing] = useState("user");
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const facingModeRef = useRef("user");

  const safeSet = useCallback((fn) => {
    if (mountedRef.current) fn();
  }, []);

  const addMessage = useCallback((from, message) => {
    safeSet(() => setMessages((old) => [...old, { from, text: message }]));
  }, [safeSet]);

  const attachLocal = useCallback(() => {
    const video = localVideoRef.current;
    const stream = localStreamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.play?.().catch(() => {});
  }, []);

  const clearRemote = useCallback(() => {
    remoteStreamRef.current = null;
    safeSet(() => {
      setRemoteReady(false);
      setRemoteTrackMuted(false);
    });
    const video = remoteVideoRef.current;
    if (!video) return;
    try { video.pause(); } catch {}
    video.srcObject = null;
  }, [safeSet]);

  const closePeer = useCallback((clearPending = true) => {
    if (clearPending) {
      pendingCandidatesRef.current = [];
      pendingSignalsRef.current = [];
    }
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
      } catch {}
    }
    clearRemote();
  }, [clearRemote]);

  const ensureMedia = useCallback(async () => {
    const existing = localStreamRef.current;
    if (existing && existing.getTracks().some((t) => t.readyState !== "ended")) {
      attachLocal();
      safeSet(() => setLocalCameraFacing(facingModeRef.current));
      const vt = existing.getVideoTracks()[0];
      const at = existing.getAudioTracks()[0];
      safeSet(() => {
        setCamera(vt ? vt.enabled : false);
        setMic(at ? at.enabled : false);
      });
      return existing;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Camera and microphone are not supported by this browser.");
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      localStreamRef.current = stream;
      facingModeRef.current = "user";
      safeSet(() => setLocalCameraFacing("user"));

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) videoTrack.onended = () => safeSet(() => setCamera(false));
      if (audioTrack) audioTrack.onended = () => safeSet(() => setMic(false));

      safeSet(() => {
        setCamera(videoTrack?.enabled !== false);
        setMic(audioTrack?.enabled !== false);
      });
      attachLocal();
      return stream;
    } catch (error) {
      console.error("getUserMedia error:", error);
      const permission = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
      alert(permission
        ? "Camera/microphone permission was blocked. Allow camera and microphone for OffCampus, then try again."
        : "Camera and microphone could not be started. Check your browser permissions and try again.");
      return null;
    }
  }, [attachLocal, safeSet]);

  const sendMediaState = useCallback((cameraOverride, micOverride) => {
    const stream = localStreamRef.current;
    const vt = stream?.getVideoTracks?.()[0];
    const at = stream?.getAudioTracks?.()[0];
    const cameraState = typeof cameraOverride === "boolean" ? cameraOverride : !!vt?.enabled;
    const micState = typeof micOverride === "boolean" ? micOverride : !!at?.enabled;

    if (socketRef.current?.connected) {
      socketRef.current.emit("media-state", {
        camera: cameraState,
        mic: micState,
        matchId: matchIdRef.current,
      });
      // Dedicated camera-state packet makes the UI independent of WebRTC
      // track mute/unmute behaviour, which differs across browsers/devices.
      socketRef.current.emit("camera-state", {
        camera: cameraState,
        matchId: matchIdRef.current,
      });
    }
  }, []);

  const sendSignal = useCallback((to, data, generation) => {
    if (!socketRef.current?.connected || !to || generation !== generationRef.current) return;
    socketRef.current.emit("signal", {
      to,
      data,
      generation,
      matchId: matchIdRef.current,
    });
  }, []);

  const attachRemoteTrack = useCallback((track) => {
    if (!track) return;

    if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
    const stream = remoteStreamRef.current;

    if (!stream.getTracks().some((t) => t.id === track.id)) {
      stream.addTrack(track);
    }

    if (track.kind === "video") {
      safeSet(() => {
        setRemoteReady(false);
        setRemoteTrackMuted(track.muted === true);
      });
      track.onmute = () => safeSet(() => {
        // Some browsers fire mute during renegotiation/initial connection.
        // Only show the off overlay when the peer explicitly reported camera OFF.
        if (remoteCameraRef.current !== true) setRemoteTrackMuted(true);
      });
      track.onunmute = () => safeSet(() => {
        setRemoteTrackMuted(false);
      });
      track.onended = () => safeSet(() => {
        setRemoteTrackMuted(true);
      });
    } else if (track.kind === "audio") {
      track.onmute = () => safeSet(() => setRemoteMic(false));
      track.onunmute = () => safeSet(() => setRemoteMic(true));
      track.onended = () => safeSet(() => setRemoteMic(false));
    }

    const video = remoteVideoRef.current;
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
      video.muted = false;
      video.autoplay = true;
      video.playsInline = true;
      video.play?.().catch(() => {});
    }
  }, [safeSet]);

  const flushCandidates = useCallback(async (pc) => {
    if (!pc?.remoteDescription) return;
    const list = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];
    for (const candidate of list) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (e) { console.warn("ICE candidate failed", e); }
    }
  }, []);

  const handleSignalRef = useRef(null);

  const createPeer = useCallback(async (initiator, generation) => {
    if (generation !== generationRef.current || !partnerRef.current) return null;
    if (creatingPeerRef.current && pcRef.current) return pcRef.current;
    creatingPeerRef.current = true;

    try {
      const stream = await ensureMedia();
      if (!stream || generation !== generationRef.current || !partnerRef.current) return null;

      closePeer(false);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && pcRef.current === pc && generation === generationRef.current) {
          sendSignal(partnerRef.current, { type: "candidate", candidate: event.candidate }, generation);
        }
      };

      pc.ontrack = (event) => {
        if (pcRef.current !== pc || generation !== generationRef.current) return;
        if (event.streams?.[0]) {
          remoteStreamRef.current = event.streams[0];
          event.streams[0].getTracks().forEach(attachRemoteTrack);
        } else {
          attachRemoteTrack(event.track);
        }
        const video = remoteVideoRef.current;
        if (video) video.play?.().catch(() => {});
      };

      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc || generation !== generationRef.current) return;
        if (pc.connectionState === "connected") {
          safeSet(() => { setStatus("matched"); setNextBusy(false); });
        } else if (["failed", "closed"].includes(pc.connectionState)) {
          console.warn("WebRTC connection:", pc.connectionState);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pcRef.current !== pc || generation !== generationRef.current) return;
        if (pc.iceConnectionState === "failed") console.warn("ICE connection failed");
      };

      const queued = [...pendingSignalsRef.current];
      pendingSignalsRef.current = [];
      for (const signal of queued) {
        await handleSignalRef.current?.(signal, generation);
      }

      if (initiator && generation === generationRef.current && partnerRef.current && pc.signalingState === "stable") {
        const offer = await pc.createOffer();
        if (generation !== generationRef.current || pcRef.current !== pc) return pc;
        await pc.setLocalDescription(offer);
        sendSignal(partnerRef.current, { type: "sdp", sdp: pc.localDescription }, generation);
      }

      return pc;
    } catch (error) {
      console.error("Peer creation failed:", error);
      return null;
    } finally {
      creatingPeerRef.current = false;
    }
  }, [attachRemoteTrack, closePeer, ensureMedia, safeSet, sendSignal]);

  const handleSignal = useCallback(async (payload, signalGeneration) => {
    // `signalGeneration` is only the receiver's local generation, used to
    // prevent work after a new match starts. Do NOT compare it with the
    // sender's generation because those counters are intentionally local.
    if (!partnerRef.current || signalGeneration !== generationRef.current) return;
    // A WebRTC signal belongs to a specific shared match. This blocks stale
    // offers/answers/candidates from an older chat without relying on local
    // generation numbers.
    if (!payload?.matchId || payload.matchId !== matchIdRef.current) return;

    const data = payload?.data || payload;
    if (!data) return;

    const pc = pcRef.current;
    if (!pc) {
      // Keep the full envelope (especially matchId) so a signal replayed
      // after RTCPeerConnection creation still passes stale-match checks.
      pendingSignalsRef.current.push(payload);
      return;
    }

    try {
      if (data.sdp) {
        const description = new RTCSessionDescription(data.sdp);

        if (description.type === "answer" && pc.signalingState !== "have-local-offer") return;
        if (description.type === "offer" && pc.signalingState !== "stable") return;

        await pc.setRemoteDescription(description);
        await flushCandidates(pc);

        if (description.type === "offer" && pc.signalingState === "have-remote-offer") {
          const answer = await pc.createAnswer();
          if (signalGeneration !== generationRef.current || pcRef.current !== pc) return;
          await pc.setLocalDescription(answer);
          sendSignal(partnerRef.current, { type: "sdp", sdp: pc.localDescription }, signalGeneration);
        }
        return;
      }

      if (data.candidate) {
        if (!pc.remoteDescription) {
          pendingCandidatesRef.current.push(data.candidate);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (error) {
      console.warn("Signal handling error:", error);
    }
  }, [flushCandidates, sendSignal]);

  useEffect(() => { handleSignalRef.current = handleSignal; }, [handleSignal]);

  const resetMatchUI = useCallback((newStatus = "searching") => {
    partnerRef.current = null;
    matchIdRef.current = null;
    setPartner(null);
    remoteCameraRef.current = null;
    setRemoteCamera(null);
    setRemoteMic(null);
    setRemoteReady(false);
    setRemoteTrackMuted(false);
    setMessages([]);
    setText("");
    setIsTyping(false);
    setStatus(newStatus);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const socket = io(SERVER, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      socket.emit("profile", profile);

      // Re-enter the queue after a reconnect only when this browser still
      // intends to search and has not already been matched.
      if (wantSearchRef.current && !partnerRef.current) {
        socket.emit("find");
      }
    });

    socket.on("connect_error", (error) => {
      if (error?.message === "MAINTENANCE" || error?.data?.schedule) {
        wantSearchRef.current = false;
        startingRef.current = false;
        closePeer();
        setStatus("idle");
        window.dispatchEvent(new CustomEvent("offcampus-maintenance", { detail: error.data?.schedule || null }));
      }
    });

    socket.on("ready", () => {
      // `ready` can arrive after the user has already tapped Start on a
      // slower mobile connection. Never reset an active search back to idle.
      if (partnerRef.current || matchIdRef.current) return;

      if (wantSearchRef.current || startingRef.current || statusRef.current === "searching") {
        safeSet(() => setStatus("searching"));
        return;
      }

      safeSet(() => setStatus("idle"));
    });

    socket.on("searching", () => {
      generationRef.current += 1;
      closePeer();
      resetMatchUI("searching");
      setNextBusy(false);
    });

    socket.on("matched", async ({ matchId, partnerId, partner: partnerProfile, partnerMedia }) => {
      const generation = ++generationRef.current;
      closePeer();
      pendingSignalsRef.current = [];
      pendingCandidatesRef.current = [];

      matchIdRef.current = matchId || null;
      partnerRef.current = partnerId || null;
      setPartner(partnerProfile || { name: "Stranger" });
      remoteCameraRef.current = partnerMedia?.camera === true;
      setRemoteCamera(partnerMedia?.camera === true);
      setRemoteMic(partnerMedia?.mic === true);
      setRemoteReady(false);
      setRemoteTrackMuted(false);
      setMessages([]);
      setText("");
      setStatus("matched");
      setNextBusy(false);
      track("match_found");

      if (!partnerId) return;

      const initiator = socket.id < partnerId;
      await createPeer(initiator, generation);

      if (generation === generationRef.current && partnerRef.current === partnerId) {
        // Send our authoritative state after the match and once again shortly
        // after. This handles the race where the match arrives before media-state.
        sendMediaState();
        window.setTimeout(() => {
          if (generation === generationRef.current && partnerRef.current === partnerId) {
            sendMediaState();
          }
        }, 300);
      }
    });

    // IMPORTANT: there must be exactly ONE signal listener. Registering a
    // listener from inside another listener causes duplicate handlers to
    // accumulate and eventually breaks WebRTC negotiation after Next/re-match.
    socket.on("signal", (payload) => {
      // generation is local to this browser. The shared matchId is the
      // authoritative identifier used to reject stale signals.
      handleSignal(payload, generationRef.current);
    });

    const applyRemoteMediaState = (state) => {
      if (!partnerRef.current || !matchIdRef.current) return;
      if (state?.matchId && state.matchId !== matchIdRef.current) return;
      if (state?.from && state.from !== partnerRef.current) return;

      if (typeof state?.camera === "boolean") {
        remoteCameraRef.current = state.camera;
        setRemoteCamera(state.camera);
        // The application-level signal is authoritative. Do not let a browser
        // track event immediately overwrite it with a stale mute state.
        if (state.camera) {
          setRemoteTrackMuted(false);
          setRemoteReady(true);
        }
        console.log("REMOTE CAMERA:", state.camera ? "ON" : "OFF");
      }
      if (typeof state?.mic === "boolean") setRemoteMic(state.mic);
    };

    socket.on("media-state", applyRemoteMediaState);
    socket.on("peer-media-state", applyRemoteMediaState);
    socket.on("camera-state", applyRemoteMediaState);

    socket.on("media-state-self", (state) => {
      if (state?.matchId && state.matchId !== matchIdRef.current) return;
      if (typeof state?.camera === "boolean") setCamera(state.camera);
      if (typeof state?.mic === "boolean") setMic(state.mic);
    });

    socket.on("chat", ({ text: incomingText, matchId }) => {
      if (matchId && matchId !== matchIdRef.current) return;
      if (partnerRef.current && incomingText) addMessage("stranger", incomingText);
    });

    socket.on("typing", ({ typing, matchId }) => {
      if (matchId && matchId !== matchIdRef.current) return;
      if (!partnerRef.current) return;
      safeSet(() => setIsTyping(Boolean(typing)));
    });

    socket.on("active-users", (count) => {
      safeSet(() => setActiveUsers(Number(count) || 0));
    });

    socket.on("partner-left", ({ matchId: endedMatchId } = {}) => {
      // Ignore a delayed disconnect notification from an older match.
      if (endedMatchId && endedMatchId !== matchIdRef.current) return;

      generationRef.current += 1;
      closePeer();
      wantSearchRef.current = false;
      resetMatchUI("ended");
      setNextBusy(false);
    });

    socket.on("blocked", () => {
      generationRef.current += 1;
      closePeer();
      resetMatchUI("searching");
      setNextBusy(false);
    });

    socket.on("connect_error", (e) => console.warn("Socket error:", e.message));

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      try { socket.emit("leave"); } catch {}
      socket.disconnect();
      closePeer();
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, [addMessage, closePeer, createPeer, handleSignal, profile, resetMatchUI, safeSet, sendMediaState]);

  useEffect(() => {
    attachLocal();
  }, [attachLocal, camera]);

  // When the peer turns their camera back on, the WebRTC track may already
  // exist and simply resume producing frames. In that case the browser does
  // not necessarily fire a new `playing` event. Explicitly wake the video
  // element and update the UI from its current readyState.
  useEffect(() => {
    if (remoteCamera !== true || !remoteStreamRef.current) return;
    const video = remoteVideoRef.current;
    if (!video) return;
    video.srcObject = remoteStreamRef.current;
    video.muted = false;
    video.autoplay = true;
    video.playsInline = true;
    video.play?.().then(() => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        safeSet(() => {
          setRemoteReady(true);
          setRemoteTrackMuted(false);
        });
      }
    }).catch(() => {});
  }, [remoteCamera, safeSet]);

  useEffect(() => {
    const end = messagesEndRef.current;
    if (!end) return;
    end.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isTyping, chatOpen]);

  const handleTextChange = (event) => {
    const value = event.target.value;
    setText(value);

    if (!partnerRef.current || !socketRef.current?.connected) return;

    const typing = value.length > 0;
    socketRef.current.emit("typing", { typing, matchId: matchIdRef.current });

    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (typing) {
      typingTimerRef.current = window.setTimeout(() => {
        socketRef.current?.emit("typing", { typing: false, matchId: matchIdRef.current });
        typingTimerRef.current = null;
      }, 1200);
    }
  };

  const startSearching = async () => {
    if (statusRef.current === "searching" || nextBusy || startingRef.current) return;

    startingRef.current = true;
    wantSearchRef.current = true;

    // Start matchmaking immediately. Do not wait for getUserMedia or a
    // mobile permission sheet before telling the server to search.
    setStatus("searching");
    socketRef.current?.emit("find");

    try {
      const stream = await ensureMedia();
      if (stream) {
        sendMediaState(
          stream.getVideoTracks()[0]?.enabled !== false,
          stream.getAudioTracks()[0]?.enabled !== false
        );
      }
    } finally {
      startingRef.current = false;
    }
  };

  const next = () => {
    if (nextBusy) return;
    track("next_clicked");
    setNextBusy(true);

    generationRef.current += 1;
    pendingSignalsRef.current = [];
    pendingCandidatesRef.current = [];
    partnerRef.current = null;
    matchIdRef.current = null;
    closePeer();
    setPartner(null);
    remoteCameraRef.current = null;
    setRemoteCamera(null);
    setRemoteMic(null);
    setRemoteReady(false);
    setRemoteTrackMuted(false);
    setMessages([]);
    setText("");
    wantSearchRef.current = true;
    setStatus("searching");

    socketRef.current?.emit("next");
  };

  const leave = () => {
    wantSearchRef.current = false;
    startingRef.current = false;
    generationRef.current += 1;
    partnerRef.current = null;
    matchIdRef.current = null;
    try { socketRef.current?.emit("leave"); } catch {}
    closePeer();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    facingModeRef.current = "user";
    setLocalCameraFacing("user");
    setCamera(false);
    setMic(false);
    onLeave();
  };

  const toggleCamera = async () => {
    const stream = await ensureMedia();
    if (!stream) return;

    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const nextState = !track.enabled;
    track.enabled = nextState;
    setCamera(nextState);

    // Application-level signal is the source of truth for the remote UI.
    sendMediaState(nextState, undefined);
  };

  const switchCamera = async () => {
    const current = localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) return;

    const nextFacingMode = facingModeRef.current === "user" ? "environment" : "user";
    let newStream = null;

    try {
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: nextFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        // Some desktop browsers/devices do not support exact facingMode.
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) throw new Error("No camera track available");

      const pc = pcRef.current;
      const sender = pc?.getSenders?.().find((item) => item.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }

      const oldVideoTrack = current?.getVideoTracks?.()[0];
      if (oldVideoTrack) oldVideoTrack.stop();

      if (current) current.removeTrack(oldVideoTrack);
      if (current) current.addTrack(newVideoTrack);
      else localStreamRef.current = newStream;

      // If we already have an audio track, keep it. Stop the temporary stream's
      // audio tracks just in case a browser adds one unexpectedly.
      newStream.getAudioTracks().forEach((track) => track.stop());
      facingModeRef.current = nextFacingMode;
      setCamera(true);
      // Force the local preview class to update immediately after the switch.
      setLocalCameraFacing(nextFacingMode);
      attachLocal();
      sendMediaState(true, undefined);
    } catch (error) {
      console.warn("Camera switch failed:", error);
      newStream?.getTracks?.().forEach((track) => track.stop());
      alert("This device/browser could not switch cameras.");
    }
  };

  const toggleMic = async () => {
    const stream = await ensureMedia();
    if (!stream) return;

    const track = stream.getAudioTracks()[0];
    if (!track) return;

    const nextState = !track.enabled;
    track.enabled = nextState;
    setMic(nextState);
    sendMediaState(undefined, nextState);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || !partnerRef.current) return;
    addMessage("you", value);
    socketRef.current?.emit("typing", { typing: false, matchId: matchIdRef.current });
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    socketRef.current?.emit("chat", { text: value });
    track("message_sent");
    setText("");
  };

  const report = () => {
    track("report_user");

    socketRef.current?.emit("report", { reason: "User report" });

    generationRef.current += 1;
    partnerRef.current = null;
    matchIdRef.current = null;
    closePeer();
    setReportOpen(false);
    resetMatchUI("searching");
    setNextBusy(false);
  };

  const block = () => {
    track("block_user");

    socketRef.current?.emit("block");

    generationRef.current += 1;
    partnerRef.current = null;
    matchIdRef.current = null;
    closePeer();
    resetMatchUI("searching");
    setNextBusy(false);
  };

  const matched = status === "matched" && !!partner;
  const searching = status === "searching";
  const localCameraOn = camera && !!localStreamRef.current?.getVideoTracks()[0]?.enabled;
  const buttonLabel = matched ? "Next" : searching ? "Searching…" : "Start";

  return (
    <div className="page chatPage">
      <header className="chatTop">
        <Logo />
        <div className="headerStatusGroup">
          <div className="connectionStatus"><span className={matched ? "statusDot online" : "statusDot"} />{matched ? "Connected" : searching ? "Searching…" : "Ready"}</div>
          <div className="activeUsers" title="Students currently connected to OffCampus">
            <span className="activeUsersDot" />{activeUsers.toLocaleString()} online
          </div>
        </div>
        <button type="button" className="leaveTop" onClick={leave}>Leave</button>
      </header>

      <main className="chatLayout">
        <section className="videoPanel strangerPanel">
          <span className="pill"><span className={matched ? "presenceDot" : "presenceDot muted"} />{partner?.name || "Stranger"}</span>

          {matched && (
            <button
              type="button"
              className="visibleReport"
              onClick={() => setReportOpen(true)}
              aria-label="Report user"
            >
              Report
            </button>
          )}

          <div className="remoteTools" aria-hidden="true">
            <span className={remoteCamera === false ? "remoteTool off" : "remoteTool"}>{remoteCamera === false ? <VideoOff size={22} strokeWidth={2} /> : <Video size={22} strokeWidth={2} />} </span>
            <span className={remoteMic === false ? "remoteTool off" : "remoteTool"}>{remoteMic === false ? <MicOff size={22} strokeWidth={2} /> : <Mic size={22} strokeWidth={2} />} </span>
          </div>

          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            onLoadedData={() => safeSet(() => setRemoteReady(true))}
            onPlaying={() => safeSet(() => setRemoteReady(true))}
            onPause={() => safeSet(() => { if (remoteCamera === true) setRemoteReady(false); })}
            className={matched && remoteCamera === true ? "remoteVideo show" : "remoteVideo"}
          />

          {matched && remoteCamera === false && (
            <div className="remoteOffOverlay">
              <div className="largePersonIcon">♙</div>
              <div className="remoteName">{partner?.name || "Stranger"}</div>
            </div>
          )}

          {!partner && (
            <div className="emptyState">
              <div className="largePersonIcon">♙</div>
              <h2>{searching ? "Finding someone…" : status === "ended" ? "Stranger left" : "Stranger"}</h2>
              <p>{searching ? "Looking for another student" : status === "ended" ? "Press Start to meet someone new" : "Hit Start to meet someone"}</p>
            </div>
          )}
        </section>

        <section className="videoPanel youPanel">
          <span className="pill"><span className="presenceDot" />You</span>

          <div className="localTools" aria-hidden="true">
            <span className={camera ? "localTool" : "localTool off"}>{camera ? <Video size={22} strokeWidth={2} /> : <VideoOff size={22} strokeWidth={2} />} </span>
            <span className={mic ? "localTool" : "localTool off"}>{mic ? <Mic size={22} strokeWidth={2} /> : <MicOff size={22} strokeWidth={2} />} </span>
          </div>

          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`${localCameraOn ? "localVideo show" : "localVideo"} ${localCameraFacing === "user" ? "frontCamera" : "backCamera"}`}
          />

          {!localCameraOn && (
            <div className="cameraOffOverlay">
              <div className="largePersonIcon">♙</div>
              <div className="youName">You</div>
            </div>
          )}

          <div className="controls">
            <button className={camera ? "control" : "control off"} onClick={toggleCamera} type="button" aria-label={camera ? "Turn camera off" : "Turn camera on"}>
              {camera ? <Video size={22} strokeWidth={2} /> : <VideoOff size={22} strokeWidth={2} />}
            </button>

            <button className="control switchCameraControl" onClick={switchCamera} type="button" aria-label="Switch camera">
              <SwitchCamera size={22} strokeWidth={2} />
            </button>

            <button className={mic ? "control" : "control off"} onClick={toggleMic} type="button" aria-label={mic ? "Mute microphone" : "Unmute microphone"}>
              {mic ? <Mic size={22} strokeWidth={2} /> : <MicOff size={22} strokeWidth={2} />}
            </button>

            <button className="control chatControl" onClick={() => setChatOpen(true)} type="button" aria-label="Open chat">
              <MessageCircle size={22} strokeWidth={2} />
            </button>

            <button className="startBtn" onClick={matched ? next : startSearching} disabled={searching || nextBusy} type="button" aria-label={matched ? "Next stranger" : "Start chatting"}>
              <SkipForward size={21} strokeWidth={2.3} />
            </button>

            <button className="control leaveControl" onClick={leave} type="button" aria-label="Leave chat">
              <LogOut size={22} strokeWidth={2} />
            </button>
          </div>
        </section>
      </main>

      <section className={chatOpen ? "chatBar chatDrawer open" : "chatBar chatDrawer"} aria-hidden={!chatOpen}>
        <div className="chatDrawerTop">
          <div className="chatPartner"><span className="presenceDot" />{partner?.name || "Stranger"}</div>
          <button type="button" className="chatClose" onClick={() => setChatOpen(false)} aria-label="Close chat"><X size={25} strokeWidth={2} /></button>
        </div>
        <div className="messages">
          {messages.map((message, index) => (
            <div key={`${message.from}-${index}-${message.text}`} className={message.from === "you" ? "bubble you" : "bubble"}>
              {message.from !== "you" && <small>{partner?.name || "Stranger"}</small>}
              {message.text}
            </div>
          ))}
          {isTyping && partner && (
            <div className="typingIndicator" aria-live="polite">
              <span className="typingDots"><i /><i /><i /></span>
              {partner.name || "Stranger"} is typing…
            </div>
          )}
          <div ref={messagesEndRef} className="messagesEnd" aria-hidden="true" />
        </div>
        <div className="chatSafety">
          <button type="button" onClick={() => setReportOpen(true)} disabled={!partner}>Report</button>
          <button type="button" onClick={block} disabled={!partner}>Block</button>
        </div>
        <form onSubmit={sendMessage}>
          <button type="button" className="emoji" aria-label="Emoji">☺</button>
          <input value={text} onChange={handleTextChange} placeholder="Say something..." disabled={!partner} maxLength={1000} />
          <button className="send" disabled={!text.trim() || !partner} aria-label="Send message"><Send size={20} strokeWidth={2} /></button>
        </form>
      </section>

      {reportOpen && (
        <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && setReportOpen(false)}>
          <div className="modalCard">
            <button className="modalClose" onClick={() => setReportOpen(false)} aria-label="Close"><X size={25} strokeWidth={2} /></button>
            <h3>Report user?</h3>
            <p>We'll end this chat and start looking for another student.</p>
            <button className="primary" onClick={report}>Report & next</button>
            <button className="modalCancel" onClick={() => setReportOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <footer className="siteFooter">
        Made with <span>♥</span> @Bhargav
      </footer>
    </div>
  );
}

function App() {
  const [profile, setProfile] = useState(null);
  const [access, setAccess] = useState({ loading: true, open: true, schedule: null });

  useEffect(() => {
    if (window.location.pathname.replace(/\/$/, "") === "/admin") return;

    let alive = true;
    const checkAccess = async () => {
      try {
        const response = await fetch(`${SERVER || ""}/api/access-status`, { cache: "no-store" });
        const data = await response.json();
        if (!alive) return;
        setAccess({ loading: false, open: data.open !== false, schedule: data.schedule || null });
        if (data.open === false) setProfile(null);
      } catch (error) {
        console.warn("Access status unavailable:", error);
        if (alive) setAccess((current) => ({ ...current, loading: false }));
      }
    };

    const onMaintenance = (event) => {
      if (!alive) return;
      setAccess({ loading: false, open: false, schedule: event.detail || null });
      setProfile(null);
    };

    window.addEventListener("offcampus-maintenance", onMaintenance);
    checkAccess();
    const timer = window.setInterval(checkAccess, 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("offcampus-maintenance", onMaintenance);
    };
  }, []);

  if (window.location.pathname.replace(/\/$/, "") === "/admin") return <AdminPortal />;
  if (access.loading) return <div className="adminLoading">Loading OffCampus…</div>;
  if (!access.open) return <MaintenanceScreen schedule={access.schedule || undefined} />;
  return profile ? <Chat profile={profile} onLeave={() => setProfile(null)} /> : <Welcome onStart={setProfile} />;
}

createRoot(document.getElementById("root")).render(<App />);
