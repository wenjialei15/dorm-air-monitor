import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import mqtt from "mqtt";

async function availablePort() {
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await check();
    if (result) return result;
    await delay(50);
  }
  throw new Error("MQTT message did not arrive");
}

function serverReady(port) {
  return new Promise((resolve) => {
    const probe = createConnection(port, "127.0.0.1");
    probe.once("error", () => resolve(false));
    probe.once("connect", () => {
      probe.destroy();
      resolve(true);
    });
  });
}

const executable = process.env.MOSQUITTO_BIN;
test("live Mosquitto carries telemetry, HA discovery and retained availability", {
  skip: !executable, timeout: 20000,
}, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "dorm-air-mqtt-"));
  const port = await availablePort();
  const config = join(directory, "mosquitto.conf");
  await writeFile(config, `listener ${port} 127.0.0.1\nallow_anonymous true\npersistence false\n`);
  const broker = spawn(executable, ["-c", config], { stdio: ["ignore", "ignore", "pipe"] });
  const brokerExit = once(broker, "exit");
  context.after(async () => {
    if (broker.exitCode === null && broker.signalCode === null) broker.kill();
    await brokerExit;
    await rm(directory, { recursive: true, force: true });
  });
  let brokerLog = "";
  broker.stderr.on("data", (chunk) => { brokerLog += chunk; });
  await waitFor(() => {
    assert.equal(broker.exitCode, null, brokerLog || "broker exited");
    return serverReady(port);
  });

  const address = `mqtt://127.0.0.1:${port}`;
  const subscriber = mqtt.connect(address);
  context.after(() => subscriber.endAsync(true));
  await once(subscriber, "connect");
  const received = [];
  subscriber.on("message", (topic, payload) => received.push({ topic, payload: String(payload) }));
  await subscriber.subscribeAsync(["dorm-air/test-dorm/#", "homeassistant/#"], { qos: 1 });
  const child = spawn(process.execPath, [
    "scripts/publish.mjs", "--broker", address, "--device", "test-dorm",
    "--minutes", "65", "--interval-ms", "10",
  ]);
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += chunk; });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, errors);
  await waitFor(() => received.some((row) => row.payload === "offline"));
  const discovery = received.filter((row) => row.topic.endsWith("/config"));
  assert.equal(discovery.length, 5);
  for (const row of discovery) {
    const data = JSON.parse(row.payload);
    assert.equal(data.state_topic, "dorm-air/test-dorm/state");
    assert.equal(data.availability_topic, "dorm-air/test-dorm/availability");
    assert.deepEqual(data.device.identifiers, ["dorm_air_test-dorm"]);
  }
  assert.equal(JSON.parse(discovery.find((row) => row.topic.includes("/co2/")).payload).device_class, "carbon_dioxide");
  const readings = received.filter((row) => row.topic.endsWith("/state")).map((row) => JSON.parse(row.payload));
  assert.equal(readings.length, 65);
  assert.ok(readings.some((row) => row.ventilation_needed));
  assert.equal(readings.at(-1).window_open, true);
  assert.equal(readings.at(-1).ventilation_needed, false);

  const lateSubscriber = mqtt.connect(address);
  context.after(() => lateSubscriber.endAsync(true));
  await once(lateSubscriber, "connect");
  const retained = new Map();
  lateSubscriber.on("message", (topic, payload, packet) => {
    if (packet.retain) retained.set(topic, String(payload));
  });
  await lateSubscriber.subscribeAsync(["dorm-air/test-dorm/#", "homeassistant/#"]);
  await waitFor(() => retained.size === 7);
  assert.equal(retained.get("dorm-air/test-dorm/availability"), "offline");
  assert.equal(JSON.parse(retained.get("dorm-air/test-dorm/state")).minute, 65);
});
