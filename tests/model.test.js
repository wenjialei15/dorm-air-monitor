import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleRoom, MAX_HISTORY, OUTDOOR_CO2, readingsCsv, Room, VentilationRule } from "../docs/model.js";

test("a short spike does not alert and a borderline decline does not clear a reminder", () => {
  const rule = new VentilationRule(1000, 5);
  for (let minute = 0; minute < 4; minute += 1) assert.equal(rule.observe(1000), "pending");
  assert.equal(rule.observe(999), "clear");
  for (let minute = 0; minute < 4; minute += 1) assert.equal(rule.observe(1020), "pending");
  assert.equal(rule.observe(1000), "active");
  assert.equal(rule.observe(901), "active");
  assert.equal(rule.observe(900), "recovering");
  assert.equal(rule.observe(901), "active");
  assert.equal(rule.observe(900), "recovering");
  assert.equal(rule.observe(900), "recovering");
  assert.equal(rule.observe(900), "clear");
});

test("same occupancy produces sustained alert, then clears with ventilation", () => {
  const room = new Room({ occupants: 4 });
  const closedReading = room.advance(35);
  assert.equal(closedReading.ventilation_needed, true);
  room.setWindow(true);
  assert.deepEqual(room.comparison(), {
    start: closedReading.co2_ppm, end: closedReading.co2_ppm, change: 0, duration: 0, ongoing: true,
  });
  const openReading = room.advance(30);
  assert.ok(openReading.co2_ppm < closedReading.co2_ppm && openReading.co2_ppm >= OUTDOOR_CO2);
  assert.equal(openReading.ventilation_needed, false);
  room.setWindow(false);
  const session = room.comparison();
  assert.equal(session.duration, 30);
  assert.equal(session.change, openReading.co2_ppm - closedReading.co2_ppm);
  assert.equal(session.ongoing, false);
  room.advance(10);
  assert.deepEqual(room.comparison(), session);
  assert.deepEqual(room.events.map((event) => event.type), ["alert", "opened", "recovered", "closed"]);
});

test("without occupants, CO2 approaches outdoor air and never undershoots", () => {
  const room = new Room({ occupants: 0 });
  room.setWindow(true);
  assert.equal(room.advance(200).co2_ppm, OUTDOOR_CO2);
  assert.equal(room.reading().ventilation_needed, false);
  assert.throws(() => room.setOccupants(7), RangeError);
  assert.throws(() => room.setRule(NaN, 5), RangeError);
});

test("rule changes start a new evaluation and history export has ordered, bounded samples", () => {
  const room = exampleRoom();
  assert.equal(room.reading().source, "simulation");
  assert.ok(room.comparison().change < 0);
  room.advance(360);
  assert.equal(room.rule.state, "active");
  room.setRule(2000, 8);
  assert.equal(room.rule.state, "clear");
  assert.equal(room.history.length, MAX_HISTORY);
  const rows = readingsCsv(room.history).trim().split("\r\n");
  assert.equal(rows.length, MAX_HISTORY + 1);
  assert.match(rows[0], /^source,minute,co2_ppm,/);
  assert.match(rows[1], new RegExp(`^simulation,${room.minute - MAX_HISTORY + 1},`));
  assert.match(rows.at(-1), new RegExp(`^simulation,${room.minute},`));
});
