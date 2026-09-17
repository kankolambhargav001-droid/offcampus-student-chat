import React, { useEffect, useMemo, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  Clock3,
  LogOut,
  Save,
  ShieldCheck,
  Wrench,
} from "lucide-react";

const firebaseConfig = {
  apiKey: "AIzaSyDsXisbhMGzMR9hkN3r525HS6SkhEQaCcs",
  authDomain: "offcampus-student-chat.firebaseapp.com",
  projectId: "offcampus-student-chat",
  storageBucket: "offcampus-student-chat.firebasestorage.app",
  messagingSenderId: "470373736264",
  appId: "1:470373736264:web:a42833795d0f96bdd31d7d",
  measurementId: "G-KTSCNKCKZ4",
};

// Reuse the existing Firebase app when main.jsx has already initialized it.
// If /admin is loaded directly, initialize the app here instead.
const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const SERVER = import.meta.env.VITE_SERVER_URL || "";

const defaultSchedule = {
  enabled: true,
  openingTime: "21:00",
  closingTime: "04:00",
  timezone: "Asia/Kolkata",
  message: "OffCampus is available from 9:00 PM to 4:00 AM.",
};

async function getToken(user) {
  if (!user) {
    throw new Error("Admin session expired. Please sign in again.");
  }

  return user.getIdToken();
}

export function MaintenanceScreen({ schedule = defaultSchedule }) {
  const formatTime = (value) => {
    if (!value) return "—";

    const [h, m] = value.split(":").map(Number);

    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;

    return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
  };

  return (
    <div className="maintenancePage">
      <div className="maintenanceCard">
        <div className="maintenanceIcon">
          <Wrench size={32} strokeWidth={2.2} />
        </div>

        <h1>OffCampus is currently unavailable</h1>

        <p>
          {schedule.message ||
            "We're currently outside our active hours."}
        </p>

        <div className="maintenanceHours">
          <Clock3 size={18} />

          <strong>
            {formatTime(schedule.openingTime)} –{" "}
            {formatTime(schedule.closingTime)}
          </strong>

          <span>IST</span>
        </div>

        <small>
          Please come back during the active hours.
        </small>
      </div>
    </div>
  );
}

function AdminLogin({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const login = async (e) => {
    e.preventDefault();

    setError("");
    setBusy(true);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      onSignedIn(credential.user);
    } catch (err) {
      console.error("Admin login error:", err);

      setError(
        "Invalid admin credentials or this account is not authorized."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adminPage">
      <div className="adminLoginCard">
        <div className="adminBrand">
          <ShieldCheck size={30} />
          <strong>OffCampus Admin</strong>
        </div>

        <h1>Admin login</h1>

        <p className="adminMuted">
          Restricted to authorized administrators.
        </p>

        <form onSubmit={login} className="adminForm">
          <label>Email</label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />

          <label>Password</label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <div className="adminError">
              {error}
            </div>
          )}

          <button
            className="primary adminSaveButton"
            type="submit"
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function AdminPortal() {
  const [user, setUser] = useState(undefined);
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser || null);
    });

    return unsubscribe;
  }, []);

  const api = useMemo(
    () => ({
      async request(path, options = {}) {
        const token = await getToken(auth.currentUser);

        const response = await fetch(`${SERVER}${path}`, {
          ...options,

          headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error || "Request failed."
          );
        }

        return data;
      },
    }),
    []
  );

  const load = async () => {
    if (!auth.currentUser) return;

    setError("");

    try {
      const data = await api.request(
        "/api/admin/settings"
      );

      setSchedule({
        ...defaultSchedule,
        ...data.schedule,
      });

      setStatus(data.status);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (user) {
      load();
    }
  }, [user]);

  if (user === undefined) {
    return (
      <div className="adminLoading">
        Loading admin portal…
      </div>
    );
  }

  if (!user) {
    return (
      <AdminLogin onSignedIn={setUser} />
    );
  }

  const save = async (e) => {
    e.preventDefault();

    setError("");
    setStatus(null);
    setBusy(true);

    try {
      const data = await api.request(
        "/api/admin/settings",
        {
          method: "PUT",

          body: JSON.stringify({
            enabled: Boolean(schedule.enabled),
            openingTime: schedule.openingTime,
            closingTime: schedule.closingTime,
            timezone: "Asia/Kolkata",
            message: schedule.message,
          }),
        }
      );

      setSchedule({
        ...defaultSchedule,
        ...data.schedule,
      });

      setStatus(data.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    setSchedule((current) => ({
      ...current,
      enabled: !current.enabled,
    }));
  };

  return (
    <div className="adminPage">
      <header className="adminHeader">
        <div className="adminBrand">
          <ShieldCheck size={28} />
          <strong>OffCampus Admin</strong>
        </div>

        <button
          className="adminLogout"
          onClick={() => signOut(auth)}
          type="button"
        >
          <LogOut size={18} />
          Logout
        </button>
      </header>

      <main className="adminMain">
        <div className="adminTitleRow">
          <div>
            <h1>Operating schedule</h1>

            <p>
              Control when students are allowed to enter
              OffCampus.
            </p>
          </div>

          <div
            className={`adminStatusBadge ${
              status?.open ? "open" : "closed"
            }`}
          >
            <span />

            {status?.open
              ? "Currently open"
              : "Currently closed"}
          </div>
        </div>

        <form
          className="adminSettingsCard"
          onSubmit={save}
        >
          <div className="adminSettingHeader">
            <div>
              <h2>Student access</h2>

              <p>
                All times are enforced by the server in
                India Standard Time.
              </p>
            </div>

            <button
              type="button"
              className={`adminToggle ${
                schedule.enabled ? "on" : ""
              }`}
              onClick={toggle}
              aria-pressed={schedule.enabled}
            >
              <span />

              {schedule.enabled
                ? "Schedule enabled"
                : "Maintenance always on"}
            </button>
          </div>

          <div className="adminTimeGrid">
            <div>
              <label>Opening time</label>

              <input
                type="time"
                value={schedule.openingTime}
                onChange={(e) =>
                  setSchedule({
                    ...schedule,
                    openingTime: e.target.value,
                  })
                }
                required
              />
            </div>

            <div>
              <label>Closing time</label>

              <input
                type="time"
                value={schedule.closingTime}
                onChange={(e) =>
                  setSchedule({
                    ...schedule,
                    closingTime: e.target.value,
                  })
                }
                required
              />
            </div>
          </div>

          <div className="adminField">
            <label>Maintenance message</label>

            <input
              value={schedule.message}
              onChange={(e) =>
                setSchedule({
                  ...schedule,
                  message: e.target.value.slice(
                    0,
                    200
                  ),
                })
              }
              maxLength={200}
            />
          </div>

          {error && (
            <div className="adminError">
              {error}
            </div>
          )}

          {status && (
            <div className="adminSuccess">
              Schedule saved. Student access is
              currently{" "}
              <strong>
                {status.open ? "OPEN" : "CLOSED"}
              </strong>
              .
            </div>
          )}

          <button
            className="primary adminSaveButton"
            type="submit"
            disabled={busy}
          >
            <Save size={18} />

            {busy
              ? "Saving…"
              : "Save schedule"}
          </button>
        </form>
      </main>
    </div>
  );
}