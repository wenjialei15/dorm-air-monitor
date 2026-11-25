# Dorm Air Monitor · 宿舍空气质量

一个纯软件的空气质量与通风提醒项目。浏览器模拟宿舍 CO₂、温度和相对湿度，支持调整人数、开关窗、设置持续超标提醒并导出数据。同一套模型还可以向 MQTT Broker 发布读数和 Home Assistant 自动发现配置。

[打开 GitHub Pages 在线演示](https://wenjialei15.github.io/dorm-air-monitor/) · [自动测试](https://github.com/wenjialei15/dorm-air-monitor/actions) · MIT

## 在线演示

1. 页面从一段预置的模拟历史开始。点击 **推进 5 分钟** 快速看趋势，或点击 **开始模拟**，每秒推进 2 模拟分钟。
2. 保持关窗并提高房间人数。默认连续 5 个模拟分钟达到 1000 ppm 时，会触发提醒。短暂超限只显示持续时间。
3. 打开窗户并继续推进。默认读数降到 900 ppm 或以下并持续 3 个模拟分钟时，提醒解除。右侧窗户按钮和开窗前后卡片会显示通风时长及 CO₂ 的变化。
4. **导出 CSV** 可保存最近 360 条样本，表格包含模拟分钟、CO₂、温湿度、人数、窗户和提醒状态。

室外 CO₂ 设为 425 ppm。模型使用均匀混合的单房间，人数影响 CO₂ 生成速率，窗户改变换气率。温湿度依据人数和换气速度向不同的目标值变化。这些系数、读数和阈值用于模拟演示。

## 本地运行

需要 Node.js 22 或更新版本。网页无需构建，也无需安装 npm 依赖。

```bash
git clone https://github.com/wenjialei15/dorm-air-monitor.git
cd dorm-air-monitor
npm start
```

打开 [http://127.0.0.1:8080](http://127.0.0.1:8080/)。如需更换端口，设置 `PORT` 环境变量后再启动。

## 接入 Home Assistant

启动一个本地 [Mosquitto](https://mosquitto.org/) Broker，或使用 Home Assistant 已配置的 MQTT Broker。将 Home Assistant 的 [MQTT 集成](https://www.home-assistant.io/integrations/mqtt/) 连接到同一个 Broker，再运行：

```bash
npm ci
npm run mqtt -- --broker mqtt://127.0.0.1:1883 --device dorm101
```

CLI 从 4 人关窗的房间开始，在第 35 个模拟分钟开窗。它持续运行，按 Ctrl+C 停止。使用 `--occupants`、`--open-at` 和 `--interval-ms` 修改场景。传入 `--minutes 65` 可运行有限时间的实验。Broker 需要身份验证时，用 `MQTT_USERNAME`、`MQTT_PASSWORD` 环境变量。配置 MQTT 集成时使用自定义 Discovery 前缀的话，给 CLI 传入相同的 `--discovery-prefix`。

| 主题 | 用途 |
| --- | --- |
| `dorm-air/dorm101/state` | 模拟遥测 JSON，带虚拟分钟和 `source: "simulation"` |
| `dorm-air/dorm101/availability` | `online` / `offline`，包括 MQTT 遗嘱 |
| `homeassistant/{sensor,binary_sensor}/dorm101/.../config` | CO₂、温度、湿度、窗户和通风提醒的自动发现配置 |

上述消息使用 QoS 1 并保留，便于后启动的订阅端获取配置和最近状态。浏览器演示和本地 MQTT 命令各自运行模拟。浏览器的控件作用于当前页面。

若只想查看原始消息，可以另开终端运行：

```bash
mosquitto_sub -h 127.0.0.1 -t "dorm-air/dorm101/#" -v
```

## 测试

```bash
npm ci
npm test
```

设置 `MOSQUITTO_BIN` 为 Mosquitto 2.x 可执行文件路径，会额外启动临时 Broker，验证遥测、通风状态、Home Assistant Discovery 和保留消息。
