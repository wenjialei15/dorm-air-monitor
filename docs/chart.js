"use strict";

(() => {
  const formatMinute = (minute) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

  function drawChart(canvas, samples, threshold, pointer = null) {
    const pen = canvas.getContext("2d");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!pen || width === 0 || height === 0) return null;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    pen.setTransform(ratio, 0, 0, ratio, 0, 0);

    const frame = { left: 47, right: width - 16, top: 20, bottom: height - 39 };
    const start = Math.max(0, samples.at(-1).minute - 60);
    const points = samples.filter((reading) => reading.minute >= start);
    const highest = Math.max(threshold, ...points.map((reading) => reading.co2_ppm), 1100);
    const step = highest < 1600 ? 200 : highest < 3000 ? 400 : 800;
    const maximum = Math.ceil((highest + 60) / step) * step;
    const x = (minute) => frame.left + (frame.right - frame.left) * (minute - start) / 60;
    const y = (co2) => frame.bottom - (frame.bottom - frame.top) * (co2 - 400) / (maximum - 400);

    pen.fillStyle = "#e8f4eb";
    for (const point of points) {
      if (!point.window_open || point.minute === start) continue;
      pen.fillRect(x(point.minute - 1), frame.top, x(point.minute) - x(point.minute - 1), frame.bottom - frame.top);
    }
    pen.fillStyle = "#567065";
    pen.font = "11px monospace";
    pen.strokeStyle = "#e2ebe3";
    for (let value = 400; value <= maximum; value += step) {
      pen.beginPath();
      pen.moveTo(frame.left, y(value));
      pen.lineTo(frame.right, y(value));
      pen.stroke();
      pen.fillText(String(value), 10, y(value) + 4);
    }
    const labelEvery = width <= 450 ? 20 : 15;
    pen.textAlign = "center";
    for (let offset = 0; offset <= 60; offset += labelEvery) {
      pen.fillText(formatMinute(start + offset), x(start + offset), frame.bottom + 19);
    }

    pen.strokeStyle = "#ae682d";
    pen.setLineDash([5, 5]);
    pen.beginPath();
    pen.moveTo(frame.left, y(threshold));
    pen.lineTo(frame.right, y(threshold));
    pen.stroke();
    pen.setLineDash([]);

    pen.strokeStyle = "#307656";
    pen.fillStyle = "#307656";
    pen.lineWidth = 2.4;
    pen.lineJoin = "round";
    pen.beginPath();
    points.forEach((point, index) => {
      const position = [x(point.minute), y(point.co2_ppm)];
      if (index === 0) pen.moveTo(...position);
      else pen.lineTo(...position);
    });
    pen.stroke();

    const wanted = Math.round(start + (pointer - frame.left) * 60 / (frame.right - frame.left));
    const hovered = pointer !== null && wanted >= start && wanted <= points.at(-1).minute
      ? points.find((point) => point.minute === wanted) : null;
    const marker = hovered ?? points.at(-1);
    const left = x(marker.minute);
    const top = y(marker.co2_ppm);
    pen.beginPath();
    pen.arc(left, top, hovered ? 4.5 : 3.5, 0, 2 * Math.PI);
    pen.fill();
    return hovered ? { sample: hovered, left, top } : null;
  }

  globalThis.DormAirChart = { drawChart, formatMinute };
})();
