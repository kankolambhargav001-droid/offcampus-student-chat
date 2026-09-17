import { io } from "socket.io-client";

const SERVER_URL = "https://offcampus-backend2.onrender.com";

const TOTAL_CLIENTS = 100;
const ROUNDS = 5;

const sockets = [];
const matchCounts = new Array(TOTAL_CLIENTS).fill(0);

let connected = 0;
let errors = 0;
let currentRound = 0;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runRound() {
  currentRound++;

  console.log(`\n========== ROUND ${currentRound} ==========`);

  for (const socket of sockets) {
    socket.emit("next");
  }
}

for (let i = 0; i < TOTAL_CLIENTS; i++) {
  const gender = i % 2 === 0 ? "male" : "female";

  const socket = io(SERVER_URL, {
    transports: ["websocket"],
    reconnection: false,
  });

  sockets.push(socket);

  socket.on("connect", () => {
    connected++;

    socket.emit("profile", {
      name: `LoadTest-${i + 1}`,
      gender,
    });
  });

  socket.on("ready", () => {
    socket.emit("find");
  });

  socket.on("matched", ({ matchId }) => {
    matchCounts[i]++;

    console.log(
      `Client ${i + 1} matched | round ${matchCounts[i]} | ${matchId}`
    );
  });

  socket.on("connect_error", error => {
    errors++;
    console.log(`Client ${i + 1} ERROR: ${error.message}`);
  });
}

// Wait for initial matching
setTimeout(async () => {
  console.log("\nInitial matching complete.");

  for (let round = 1; round <= ROUNDS; round++) {
    runRound();

    // Give the backend time to process the new matching.
    await wait(5000);
  }

  console.log("\n========== FINAL RESULTS ==========");

  console.log(`Clients created : ${TOTAL_CLIENTS}`);
  console.log(`Connected       : ${connected}`);
  console.log(`Connection errs : ${errors}`);

  const fullyMatched = matchCounts.filter(
    count => count >= ROUNDS + 1
  ).length;

  const partiallyMatched = matchCounts.filter(
    count => count > 0 && count < ROUNDS + 1
  ).length;

  const neverMatched = matchCounts.filter(
    count => count === 0
  ).length;

  console.log(`Expected rounds per client : ${ROUNDS + 1}`);
  console.log(`Fully matched clients      : ${fullyMatched}`);
  console.log(`Partially matched clients  : ${partiallyMatched}`);
  console.log(`Never matched clients      : ${neverMatched}`);

  console.log("\nMatch counts:");

  for (let i = 0; i < TOTAL_CLIENTS; i++) {
    console.log(
      `Client ${i + 1}: ${matchCounts[i]} matches`
    );
  }

  for (const socket of sockets) {
    socket.disconnect();
  }

  process.exit(0);
}, 5000);