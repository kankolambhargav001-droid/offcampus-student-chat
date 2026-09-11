import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./styles.css";

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
        <button className="modalClose" onClick={onClose} aria-label="Close">×</button>
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

  const [status, setStatus] = useState("idle");
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
      pendingSignalsRef.current.push(data);
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
    });

    socket.on("ready", () => safeSet(() => setStatus("idle")));

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

    socket.on("partner-left", ({ matchId: endedMatchId } = {}) => {
      // Ignore a delayed disconnect notification from an older match.
      if (endedMatchId && endedMatchId !== matchIdRef.current) return;
      generationRef.current += 1;
      closePeer();
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

  const startSearching = async () => {
    if (status === "searching" || nextBusy) return;

    const stream = await ensureMedia();
    if (!stream) return;

    // Important: persist the actual camera/mic state on the server BEFORE find.
    // That way partnerMedia is correct even on the first match.
    sendMediaState(
      stream.getVideoTracks()[0]?.enabled !== false,
      stream.getAudioTracks()[0]?.enabled !== false
    );

    setStatus("searching");
    socketRef.current?.emit("find");
  };

  const next = () => {
    if (nextBusy) return;
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
    setStatus("searching");

    socketRef.current?.emit("next");
  };

  const leave = () => {
    generationRef.current += 1;
    partnerRef.current = null;
    matchIdRef.current = null;
    try { socketRef.current?.emit("leave"); } catch {}
    closePeer();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
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
    socketRef.current?.emit("chat", { text: value });
    setText("");
  };

  const report = () => {
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
  const buttonLabel = matched ? "Next" : searching ? "Searching…" : "▶ Start";

  return (
    <div className="page chatPage">
      <header className="chatTop">
        <Logo />
        <div className={matched ? "statusDot online" : "statusDot"} />
        <button type="button" onClick={leave}>Leave</button>
      </header>

      <main className="chatLayout">
        <section className="videoPanel strangerPanel">
          <span className="pill">{partner?.name || "Stranger"}</span>

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
              <div className="cameraOffIcon">📷</div>
              <h2>Camera is off</h2>
              <p>{partner?.name || "Stranger"} turned off their camera</p>
              {remoteMic === false && <span className="remoteMutedHint">🔇 Microphone is off</span>}
            </div>
          )}


          {!partner && (
            <div className="emptyState">
              <div className="personIcon">♙</div>
              <h2>{searching ? "Finding someone…" : status === "ended" ? "Stranger left" : "Stranger"}</h2>
              <p>{searching ? "Looking for another student" : status === "ended" ? "Press Start to meet someone new" : "Hit Start to meet someone"}</p>
            </div>
          )}
        </section>

        <section className="videoPanel youPanel">
          <span className="pill">You</span>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={localCameraOn ? "localVideo show" : "localVideo"}
          />
          {!localCameraOn && (
            <div className="cameraOffOverlay">
              <div className="personIcon">♙</div>
              <h2>Camera is off</h2>
              <p>Tap the camera button to turn it on</p>
            </div>
          )}

          <div className="controls">
            <button
              className={camera ? "control" : "control off"}
              onClick={toggleCamera}
              type="button"
              aria-label={camera ? "Turn camera off" : "Turn camera on"}
              title={camera ? "Turn camera off" : "Turn camera on"}
            >📷</button>
            <button
              className={mic ? "control" : "control off"}
              onClick={toggleMic}
              type="button"
              aria-label={mic ? "Mute microphone" : "Unmute microphone"}
              title={mic ? "Mute microphone" : "Unmute microphone"}
            >🎙</button>
            <button
              className="startBtn"
              onClick={matched ? next : startSearching}
              disabled={searching || nextBusy}
              type="button"
            >
              {nextBusy ? "Searching…" : buttonLabel}
            </button>
          </div>
        </section>
      </main>

      <section className="chatBar">
        <div className="messages">
          {messages.slice(-4).map((message, index) => (
            <div key={`${message.from}-${index}-${message.text}`} className={message.from === "you" ? "bubble you" : "bubble"}>
              {message.text}
            </div>
          ))}
        </div>

        <form onSubmit={sendMessage}>
          <button type="button" className="emoji" aria-label="Emoji">☺</button>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={partner ? "Say something..." : "Find someone to chat..."} disabled={!partner} maxLength={1000} />
          <button className="send" disabled={!text.trim() || !partner} aria-label="Send message">↑</button>
        </form>

        <div className="actions">
          <button type="button" onClick={() => setReportOpen(true)} disabled={!partner}>Report</button>
          <button type="button" onClick={block} disabled={!partner}>Block</button>
        </div>
      </section>

      {reportOpen && (
        <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && setReportOpen(false)}>
          <div className="modalCard">
            <button className="modalClose" onClick={() => setReportOpen(false)} aria-label="Close">×</button>
            <h3>Report user?</h3>
            <p>We'll end this chat and start looking for another student.</p>
            <button className="primary" onClick={report}>Report & next</button>
            <button className="modalCancel" onClick={() => setReportOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [profile, setProfile] = useState(null);
  return profile ? <Chat profile={profile} onLeave={() => setProfile(null)} /> : <Welcome onStart={setProfile} />;
}

createRoot(document.getElementById("root")).render(<App />);
