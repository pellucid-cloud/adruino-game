# Tauri Endless Runner

一个最小的 Tauri 2 + Vanilla JS 无尽躲避小游戏。

## 运行

```bash
npm install
npm run tauri dev
```

## 操作

- ←：向左移动
- →：向右移动
- ESC：暂停/继续
- Enter：开始或重新开始

## 玩法

角色持续向前，障碍物从远处向玩家移动。随着时间增加，游戏速度逐步提高。


## Arduino 控制

本项目支持 Arduino Mega 2560 的两个按钮：

- A0：左移
- A3：右移
- 两个按钮另一端都接 GND
- 使用 `INPUT_PULLUP`，不需要额外电阻
- 串口波特率：9600

Arduino 程序位于：`arduino/arduino_runner.ino`

启动游戏后，Tauri 会自动扫描串口并优先寻找 Arduino 常见 USB VID；找不到时回退到第一个可用串口。Mac 上一般会看到 `/dev/cu.usbmodem*`，Windows 上一般会看到 `COMx`。

注意：Arduino IDE 的串口监视器和游戏不能同时占用同一个串口。运行游戏前请关闭串口监视器。
