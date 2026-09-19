#pragma once

#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// The computer running `pnpm dev`, reachable from the ESP32's Wi-Fi network.
#define OTTO_HOST "192.168.1.20"
#define OTTO_PORT 3000
#define OTTO_DEVICE_TOKEN "dev-device-token"

// Local development uses ws://. Public deployments should use wss:// and a
// trusted certificate rather than disabling certificate verification.
#define OTTO_USE_TLS 0
