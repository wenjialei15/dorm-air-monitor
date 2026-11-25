"use strict";

(() => {
  const { drawChart, formatMinute } = globalThis.DormAirChart;
  const { exampleRoom, readingsCsv, MAX_OCCUPANTS, RECOVERY_GAP, RECOVERY_MINUTES } = globalThis.DormAirModel;

  const byId = (id) => document.getElementById(id);
  const chart = byId("chart");
  const tooltip = byId("tooltip");
  const play = byId("play");
  const decreaseOccupants = byId("occupants-minus");
  const increaseOccupants = byId("occupants-plus");
  const thresholdInput = byId("threshold");
  const delayInput = byId("delay");
  let room = exampleRoom();
  let timer = null;
  let pointer = null;
  let eventCount = 0;
  let lastEvent;

  function setText(id, value) {
    const node = byId(id);
    const text = String(value);
    if (node.textContent !== text) node.textContent = text;
  }

  function renderNotice() {
    const { state, threshold, delay, above, below } = room.rule;
    const messages = {
      clear: ["暂未触发通风提醒", `连续 ${delay} 分钟达到 ${threshold} ppm 时提醒`],
      pending: ["检测到 CO₂ 偏高", `已持续 ${above} / ${delay} 模拟分钟`],
      active: ["建议开窗通风", `降至 ${threshold - RECOVERY_GAP} ppm 并持续 ${RECOVERY_MINUTES} 模拟分钟后解除`],
      recovering: ["CO₂ 正在回落", `已符合解除条件 ${below} / ${RECOVERY_MINUTES} 模拟分钟`],
    };
    byId("notice").dataset.state = state;
    setText("notice-title", messages[state][0]);
    setText("notice-detail", messages[state][1]);
  }

  function renderComparison() {
    const session = room.comparison();
    if (!session) return;
    setText("comparison-status", `${session.ongoing ? "开窗中" : "最近一次通风"} · ${session.duration} 模拟分钟`);
    setText("after-label", session.ongoing ? "当前读数" : "关窗时");
    setText("before", session.start);
    setText("after", session.end);
    setText("change", session.change > 0 ? `+${session.change}` : session.change);
    byId("change").dataset.trend = session.change < 0 ? "down" : session.change > 0 ? "up" : "steady";
  }

  function renderEvents() {
    if (eventCount === room.events.length && lastEvent === room.events.at(-1)) return;
    const entries = room.events.slice(-6).reverse().map((event) => {
      const copy = {
        occupants: `人数调整为 ${event.count} 人`,
        opened: `打开窗户 · ${event.co2} ppm`,
        closed: `关闭窗户 · ${event.co2} ppm`,
        alert: `触发通风提醒 · ${event.co2} ppm`,
        recovered: `解除通风提醒 · ${event.co2} ppm`,
        rule: `规则更新 · ${event.threshold} ppm / ${event.delay} 分钟`,
      };
      const row = document.createElement("li");
      const time = document.createElement("time");
      time.textContent = formatMinute(event.minute);
      const text = document.createElement("span");
      text.textContent = copy[event.type];
      row.append(time, text);
      return row;
    });
    byId("events").replaceChildren(...entries);
    eventCount = room.events.length;
    lastEvent = room.events.at(-1);
  }

  function renderChart() {
    const detail = drawChart(chart, room.history, room.rule.threshold, pointer);
    tooltip.hidden = !detail;
    if (!detail) return;
    tooltip.textContent = `${formatMinute(detail.sample.minute)} · ${detail.sample.co2_ppm} ppm`;
    tooltip.style.left = `${Math.max(4, Math.min(chart.clientWidth - tooltip.offsetWidth - 4, detail.left - 45))}px`;
    tooltip.style.top = `${Math.max(4, detail.top - 28)}px`;
  }

  function render() {
    const latest = room.reading();
    setText("co2", latest.co2_ppm);
    setText("temperature", latest.temperature_c.toFixed(1));
    setText("humidity", latest.humidity_pct.toFixed(1));
    setText("occupant-count", `${latest.occupants} 人`);
    decreaseOccupants.disabled = latest.occupants === 0;
    increaseOccupants.disabled = latest.occupants === MAX_OCCUPANTS;
    setText("window-status", latest.window_open ? "打开" : "关闭");
    setText("window", latest.window_open ? "关闭窗户" : "打开窗户");
    setText("play", timer === null ? "开始模拟" : "暂停模拟");
    play.setAttribute("aria-pressed", String(timer !== null));
    chart.setAttribute("aria-label", `模拟 CO₂ 浓度趋势，${formatMinute(latest.minute)} 时为 ${latest.co2_ppm} ppm`);
    renderNotice();
    renderComparison();
    renderEvents();
    renderChart();
  }

  function pause() {
    window.clearInterval(timer);
    timer = null;
  }

  function adjustOccupants(change) {
    room.setOccupants(room.occupants + change);
    render();
  }

  play.addEventListener("click", () => {
    if (timer === null) {
      room.advance();
      timer = window.setInterval(() => { room.advance(); render(); }, 500);
    } else {
      pause();
    }
    render();
  });
  byId("step").addEventListener("click", () => { room.advance(5); render(); });
  byId("reset").addEventListener("click", () => {
    room = exampleRoom();
    pause();
    pointer = null;
    thresholdInput.value = room.rule.threshold;
    delayInput.value = room.rule.delay;
    render();
  });
  decreaseOccupants.addEventListener("click", () => adjustOccupants(-1));
  increaseOccupants.addEventListener("click", () => adjustOccupants(1));
  byId("window").addEventListener("click", () => { room.setWindow(!room.windowOpen); render(); });
  byId("policy").addEventListener("submit", (event) => {
    event.preventDefault();
    room.setRule(thresholdInput.valueAsNumber, delayInput.valueAsNumber);
    render();
  });
  chart.addEventListener("pointermove", (event) => { pointer = event.offsetX; renderChart(); });
  chart.addEventListener("pointerleave", () => { pointer = null; renderChart(); });
  byId("export").addEventListener("click", () => {
    const href = URL.createObjectURL(new Blob([readingsCsv(room.history)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = "dorm-air-readings.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
  new ResizeObserver(renderChart).observe(chart);
  render();
  play.disabled = false;
})();
