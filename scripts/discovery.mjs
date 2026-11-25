const sensors = [
  { id: "co2", name: "CO₂", device_class: "carbon_dioxide", field: "co2_ppm", unit: "ppm" },
  { id: "temperature", name: "温度", device_class: "temperature", field: "temperature_c", unit: "°C" },
  { id: "humidity", name: "相对湿度", device_class: "humidity", field: "humidity_pct", unit: "%" },
];
const binarySensors = [
  { id: "window", name: "窗户", device_class: "window", field: "window_open" },
  { id: "ventilation", name: "通风提醒", device_class: "problem", field: "ventilation_needed" },
];

export function topics(id) {
  const base = `dorm-air/${id}`;
  return { state: `${base}/state`, availability: `${base}/availability` };
}

export function discoveryMessages(id, prefix) {
  const { state, availability } = topics(id);
  const config = {
    state_topic: state,
    availability_topic: availability,
    device: { identifiers: [`dorm_air_${id}`], name: `Dorm Air ${id}`, model: "软件模拟器" },
    qos: 1,
  };
  const entry = (kind, sensor, fields) => ({
    topic: `${prefix}/${kind}/${id}/${sensor.id}/config`,
    payload: JSON.stringify({
      ...config,
      unique_id: `dorm_air_${id}_${sensor.id}`,
      name: sensor.name,
      device_class: sensor.device_class,
      ...fields,
    }),
  });
  return [
    ...sensors.map((sensor) => entry("sensor", sensor, {
      unit_of_measurement: sensor.unit,
      state_class: "measurement",
      value_template: `{{ value_json.${sensor.field} }}`,
    })),
    ...binarySensors.map((sensor) => entry("binary_sensor", sensor, {
      value_template: `{{ 'ON' if value_json.${sensor.field} else 'OFF' }}`,
    })),
  ];
}
