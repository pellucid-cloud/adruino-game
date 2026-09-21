use std::{
    io::{BufRead, BufReader, ErrorKind},
    thread,
    time::Duration,
};

use serialport::SerialPortType;
use tauri::{AppHandle, Emitter};

/// 自动寻找 Arduino Mega 常见 USB VID。
/// 如果没有匹配到，则回退到第一个串口。
fn find_arduino_port() -> Option<String> {
    let ports = serialport::available_ports().ok()?;

    // Arduino 官方板常见 VID。
    for port in &ports {
        if let SerialPortType::UsbPort(info) = &port.port_type {
            if info.vid == 0x2341 || info.vid == 0x2A03 {
                return Some(port.port_name.clone());
            }
        }
    }

    // 兼容部分 USB-串口芯片/兼容板。
    ports.first().map(|port| port.port_name.clone())
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<String>, String> {
    serialport::available_ports()
        .map(|ports| ports.into_iter().map(|port| port.port_name).collect())
        .map_err(|e| format!("读取串口列表失败：{e}"))
}

#[tauri::command]
fn start_serial(app: AppHandle, requested_port: Option<String>) -> Result<String, String> {
    let port_name = match requested_port {
        Some(port) if !port.trim().is_empty() => port,
        _ => find_arduino_port().ok_or_else(|| "没有找到可用串口，请先连接 Arduino".to_string())?,
    };

    let thread_port_name = port_name.clone();

    thread::spawn(move || {
        let port = match serialport::new(&thread_port_name, 9600)
            .timeout(Duration::from_millis(100))
            .open()
        {
            Ok(port) => port,
            Err(error) => {
                let _ = app.emit(
                    "arduino-status",
                    format!("连接失败：{error}"),
                );
                return;
            }
        };

        let _ = app.emit(
            "arduino-status",
            format!("已连接：{thread_port_name}"),
        );

        let mut reader = BufReader::new(port);

        loop {
            let mut line = String::new();

            match reader.read_line(&mut line) {
                Ok(0) => continue,
                Ok(_) => {
                    let message = line.trim();

                    match message {
                        "LEFT_DOWN" => {
                            let _ = app.emit("arduino-left-down", ());
                        }
                        "LEFT_UP" => {
                            let _ = app.emit("arduino-left-up", ());
                        }
                        "RIGHT_DOWN" => {
                            let _ = app.emit("arduino-right-down", ());
                        }
                        "RIGHT_UP" => {
                            let _ = app.emit("arduino-right-up", ());
                        }
                        _ => {}
                    }
                }
                Err(error) if error.kind() == ErrorKind::TimedOut => {
                    // 正常的串口超时，继续等待数据。
                }
                Err(error) => {
                    let _ = app.emit(
                        "arduino-status",
                        format!("串口断开：{error}"),
                    );
                    break;
                }
            }
        }
    });

    Ok(port_name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_serial_ports, start_serial])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
