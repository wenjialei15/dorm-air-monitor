"use strict";

(() => {
  const OUTDOOR_CO2 = 425;
  const DEFAULT_THRESHOLD = 1000;
  const DEFAULT_DELAY = 5;
  const RECOVERY_GAP = 100;
  const RECOVERY_MINUTES = 3;
  const MAX_HISTORY = 360;
  const MAX_OCCUPANTS = 6;

  const round = (value, digits = 0) => Number(value.toFixed(digits));

  function range(value, min, max, name) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
    }
    return value;
  }

  function approach(value, equilibrium, rate) {
    return equilibrium + (value - equilibrium) * Math.exp(-rate);
  }

  class VentilationRule {
    constructor(threshold = DEFAULT_THRESHOLD, delay = DEFAULT_DELAY) {
      this.threshold = range(threshold, 700, 2000, "threshold");
      this.delay = range(delay, 1, 30, "delay");
      this.above = 0;
      this.below = 0;
      this.active = false;
      this.state = "clear";
    }

    observe(co2) {
      if (!Number.isFinite(co2)) throw new TypeError("CO₂ must be finite");
      this.above = co2 >= this.threshold ? this.above + 1 : 0;
      this.below = co2 <= this.threshold - RECOVERY_GAP ? this.below + 1 : 0;
      if (this.active) {
        this.active = this.below < RECOVERY_MINUTES;
      } else {
        this.active = this.above >= this.delay;
      }
      this.state = this.active ? (this.below ? "recovering" : "active") : (this.above ? "pending" : "clear");
      return this.state;
    }
  }

  class Room {
    constructor({ occupants = 3, threshold = DEFAULT_THRESHOLD, delay = DEFAULT_DELAY } = {}) {
      this.occupants = range(occupants, 0, MAX_OCCUPANTS, "occupants");
      this.rule = new VentilationRule(threshold, delay);
      this.windowOpen = false;
      this.minute = 0;
      this.air = { co2: 630, temperature: 24.6, humidity: 51 };
      this.history = [this.reading()];
      this.events = [];
      this.session = null;
    }

    reading() {
      return {
        source: "simulation",
        minute: this.minute,
        co2_ppm: round(this.air.co2),
        temperature_c: round(this.air.temperature, 1),
        humidity_pct: round(this.air.humidity, 1),
        occupants: this.occupants,
        window_open: this.windowOpen,
        ventilation_needed: this.rule.active,
        alert_state: this.rule.state,
      };
    }

    setOccupants(value) {
      const next = range(value, 0, MAX_OCCUPANTS, "occupants");
      if (next === this.occupants) return;
      this.occupants = next;
      this.record("occupants", { count: next });
    }

    setWindow(isOpen) {
      if (typeof isOpen !== "boolean") throw new TypeError("window state must be boolean");
      if (isOpen === this.windowOpen) return;
      this.windowOpen = isOpen;
      const co2 = this.reading().co2_ppm;
      if (isOpen) {
        this.session = { startMinute: this.minute, startCo2: co2, endMinute: null, endCo2: null };
      } else {
        this.session = { ...this.session, endMinute: this.minute, endCo2: co2 };
      }
      this.record(isOpen ? "opened" : "closed", { co2 });
    }

    setRule(threshold, delay) {
      if (this.rule.threshold === threshold && this.rule.delay === delay) return;
      this.rule = new VentilationRule(threshold, delay);
      this.record("rule", { threshold, delay });
    }

    comparison() {
      if (!this.session) return null;
      const { startMinute, startCo2, endMinute, endCo2 } = this.session;
      const current = endCo2 ?? this.reading().co2_ppm;
      return {
        start: startCo2,
        end: current,
        change: current - startCo2,
        duration: (endMinute ?? this.minute) - startMinute,
        ongoing: endMinute === null,
      };
    }

    record(type, detail = {}) {
      this.events.push({ minute: this.minute, type, ...detail });
      if (this.events.length > 40) this.events.shift();
    }

    advance(minutes = 1) {
      range(minutes, 1, 720, "minutes");
      for (let index = 0; index < minutes; index += 1) {
        const exchange = this.windowOpen ? 6 / 60 : 0.32 / 60;
        const equilibrium = OUTDOOR_CO2 + 7.2 * this.occupants / exchange;
        this.air.co2 = approach(this.air.co2, equilibrium, exchange);
        this.air.temperature = approach(
          this.air.temperature, (this.windowOpen ? 21.8 : 24.8) + this.occupants * 0.35, exchange + 0.018,
        );
        this.air.humidity = approach(
          this.air.humidity, (this.windowOpen ? 45 : 50) + this.occupants * 1.25, exchange + 0.022,
        );
        this.minute += 1;
        const wasActive = this.rule.active;
        const co2 = round(this.air.co2);
        this.rule.observe(co2);
        if (wasActive !== this.rule.active) {
          this.record(this.rule.active ? "alert" : "recovered", { co2 });
        }
        this.history.push(this.reading());
        if (this.history.length > MAX_HISTORY) this.history.shift();
      }
      return this.history.at(-1);
    }
  }

  function exampleRoom() {
    const room = new Room({ occupants: 1 });
    room.advance(12);
    room.setOccupants(2);
    room.advance(13);
    room.setWindow(true);
    room.advance(12);
    room.setWindow(false);
    room.setOccupants(3);
    room.advance(16);
    return room;
  }

  const CSV_FIELDS = [
    "source", "minute", "co2_ppm", "temperature_c", "humidity_pct",
    "occupants", "window_open", "ventilation_needed", "alert_state",
  ];

  function readingsCsv(readings) {
    const rows = readings.map((reading) => CSV_FIELDS.map((key) => reading[key]).join(","));
    return [CSV_FIELDS.join(","), ...rows].join("\r\n") + "\r\n";
  }

  const exports = typeof module === "object" && module.exports
    ? module.exports : (globalThis.DormAirModel = {});
  exports.OUTDOOR_CO2 = OUTDOOR_CO2;
  exports.DEFAULT_THRESHOLD = DEFAULT_THRESHOLD;
  exports.DEFAULT_DELAY = DEFAULT_DELAY;
  exports.RECOVERY_GAP = RECOVERY_GAP;
  exports.RECOVERY_MINUTES = RECOVERY_MINUTES;
  exports.MAX_HISTORY = MAX_HISTORY;
  exports.MAX_OCCUPANTS = MAX_OCCUPANTS;
  exports.VentilationRule = VentilationRule;
  exports.Room = Room;
  exports.exampleRoom = exampleRoom;
  exports.readingsCsv = readingsCsv;
})();
