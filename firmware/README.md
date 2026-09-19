# Otto ESP32 firmware

`otto-device/otto-device.ino` implements the device side of MainPRD requirements
FW-1 through FW-6:

- hold the button to stream 16 kHz mono PCM from the microphone;
- release it to ask the server for a response;
- receive the server's paced PCM and play it through the TLV320DAC3100;
- pressing the button while Otto is speaking immediately clears playback.

## Arduino libraries

Install these from Arduino IDE's Library Manager:

- `WebSockets` by Markus Sattler
- `Adafruit TLV320 I2S`
- `Adafruit BusIO`

Copy `secrets.example.h` to `secrets.h`, then set the Wi-Fi credentials, the
computer's LAN address, and the same `DEVICE_TOKEN` used by `apps/server/.env`.
For a local server, leave TLS off and use port 3000.

## Wiring used by the sketch

| Part | Signal | ESP32 GPIO |
|---|---|---:|
| microphone | BCLK | 26 |
| microphone | WS/LRCLK | 25 |
| microphone | DATA | 33 |
| button | signal, active low | 4 |
| TLV320 | SDA | 21 |
| TLV320 | SCL | 22 |
| TLV320 | BCK | 14 |
| TLV320 | WSEL | 27 |
| TLV320 | DIN | 32 |
| TLV320 | RST | 13 |

All modules must share ground. Connect the button's other terminal to ground.
The TLV320's logic signals are 3.3 V, but its `VIN` must receive 5 V when using
the onboard speaker amplifier. Do not power the speaker output from the LiPo
cell directly; use the regulated 5 V booster output.

## Server

From the repository root:

```sh
pnpm install
cp apps/server/.env.example apps/server/.env
# Set OPENAI_API_KEY. Keep DEVICE_TOKEN equal to OTTO_DEVICE_TOKEN in secrets.h.
pnpm dev
```

The ESP32 connects to:

```text
ws://<OTTO_HOST>:3000/device?token=<OTTO_DEVICE_TOKEN>
```

Use the computer's LAN address in `OTTO_HOST`; `localhost` would point back to
the ESP32 itself.
