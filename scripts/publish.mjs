import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import mqtt from "mqtt";
import { MAX_OCCUPANTS, Room } from "../docs/model.js";
import { discoveryMessages, topics } from "./discovery.mjs";

const options = {
  broker: { type: "string", default: "mqtt://127.0.0.1:1883" },
  device: { type: "string", default: "dorm101" },
  occupants: { type: "string", default: "4" },
  "open-at": { type: "string", default: "35" },
  "interval-ms": { type: "string", default: "500" },
  minutes: { type: "string", default: "0" },
  "discovery-prefix": { type: "string", default: "homeassistant" },
  help: { type: "boolean", short: "h" },
};

function number(value, min, max, name) {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function identifier(value) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(value)) throw new RangeError("invalid device or discovery prefix");
  return value;
}

async function withTimeout(operation, label) {
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), 5000);
    });
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function publish(options, signal) {
  const broker = new URL(options.broker);
  if (!["mqtt:", "mqtts:"].includes(broker.protocol) || !broker.hostname || broker.username || broker.password) {
    throw new TypeError("use an mqtt:// or mqtts:// broker URL and MQTT_USERNAME / MQTT_PASSWORD for credentials");
  }
  const id = identifier(options.device);
  const prefix = identifier(options["discovery-prefix"]);
  const room = new Room({ occupants: number(options.occupants, 0, MAX_OCCUPANTS, "occupants") });
  const openAt = number(options["open-at"], 0, 1440, "open-at");
  const interval = number(options["interval-ms"], 10, 60_000, "interval-ms");
  const minutes = number(options.minutes, 0, 1440, "minutes");
  const { state, availability } = topics(id);
  const retained = { qos: 1, retain: true };
  const client = mqtt.connect(broker.href, {
    clientId: `dorm-air-${id}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 0,
    connectTimeout: 4000,
    will: { topic: availability, payload: "offline", ...retained },
  });
  client.on("error", (error) => console.error(`MQTT: ${error.message}`));
  const send = (topic, payload) => withTimeout(client.publishAsync(topic, payload, retained), topic);

  try {
    if (!client.connected) await withTimeout(once(client, "connect"), "connect");
    for (const { topic, payload } of discoveryMessages(id, prefix)) await send(topic, payload);
    await send(availability, "online");
    console.log(`Publishing simulated readings for ${id} to ${state}`);
    while (!signal.aborted && (minutes === 0 || room.minute < minutes)) {
      if (room.minute === openAt) room.setWindow(true);
      if (!client.connected) throw new Error("Broker disconnected");
      const reading = { device: id, ...room.advance() };
      await send(state, JSON.stringify(reading));
      if (minutes !== 0 && room.minute === minutes) break;
      await delay(interval, undefined, { signal });
    }
  } finally {
    try {
      if (client.connected) await send(availability, "offline");
    } finally {
      await client.endAsync(true);
    }
  }
}

try {
  const { values } = parseArgs({ options });
  if (values.help) {
    console.log("npm run mqtt -- [--broker mqtt://127.0.0.1:1883] [--device dorm101]");
    console.log("               [--occupants 4] [--open-at 35] [--interval-ms 500] [--minutes 0]");
    console.log("               [--discovery-prefix homeassistant]");
  } else {
    const controller = new AbortController();
    process.once("SIGINT", () => controller.abort());
    process.once("SIGTERM", () => controller.abort());
    await publish(values, controller.signal);
  }
} catch (error) {
  if (error.name !== "AbortError") {
    console.error(error.message);
    process.exitCode = 1;
  }
}
