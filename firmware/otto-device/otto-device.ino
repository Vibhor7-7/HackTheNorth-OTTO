#include <Arduino.h>
#include <Adafruit_TLV320DAC3100.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <Wire.h>
#include "driver/i2s.h"
#include "freertos/stream_buffer.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy secrets.example.h to secrets.h and fill in the local values"
#endif

// Microphone: SPH0645/compatible I2S input.
constexpr i2s_port_t MIC_I2S = I2S_NUM_0;
constexpr int MIC_BCLK = 26;
constexpr int MIC_WS = 25;
constexpr int MIC_DATA = 33;

// TLV320DAC3100: I2C control plus a separate I2S output bus.
constexpr i2s_port_t DAC_I2S = I2S_NUM_1;
constexpr int TLV_SDA = 21;
constexpr int TLV_SCL = 22;
constexpr int TLV_BCLK = 14;
constexpr int TLV_WS = 27;
constexpr int TLV_DATA = 32;
constexpr int TLV_RESET = 13;

constexpr int BUTTON_PIN = 4;
constexpr char FIRMWARE_VERSION[] = "otto-audio-9";
constexpr uint32_t SAMPLE_RATE = 16000;
constexpr size_t MONO_FRAME_SAMPLES = 640; // 40 ms at 16 kHz.
constexpr float MIC_GAIN = 1.0f;
constexpr size_t PLAYBACK_BUFFER_BYTES = 96 * 1024;
constexpr size_t PLAYBACK_PREBUFFER_BYTES = 48 * 1024; // About 1.5 s of mono PCM.
constexpr uint32_t DEBOUNCE_MS = 30;
constexpr uint32_t CANCEL_PRESS_MS = 250;
constexpr uint32_t MAX_TURN_MS = 60000;

WebSocketsClient webSocket;
Adafruit_TLV320DAC3100 codec;
StreamBufferHandle_t playbackBuffer;

int32_t micInput[MONO_FRAME_SAMPLES];
int16_t micOutput[MONO_FRAME_SAMPLES];

volatile bool socketConnected = false;
volatile bool playbackEnabled = false;
volatile bool responseComplete = false;
volatile bool playbackStarted = false;
bool talking = false;
bool stableButton = HIGH;
bool sampledButton = HIGH;
uint32_t sampledButtonAt = 0;
uint32_t talkStartedAt = 0;
uint32_t lastMicReportAt = 0;
uint32_t reconnectMs = 1000;

void halt(const char *message) {
  Serial.println(message);
  while (true) delay(1000);
}

void stopPlayback() {
  playbackEnabled = false;
  playbackStarted = false;
  responseComplete = false;
  xStreamBufferReset(playbackBuffer);
  i2s_zero_dma_buffer(DAC_I2S);
}

void startPlayback() {
  playbackEnabled = false;
  playbackStarted = false;
  xStreamBufferReset(playbackBuffer);
  i2s_zero_dma_buffer(DAC_I2S);
  responseComplete = false;
  playbackEnabled = true;
}

void queuePlayback(const uint8_t *data, size_t length) {
  if (!playbackEnabled || length < 2) return;
  length -= length % 2;
  size_t queued = xStreamBufferSend(playbackBuffer, data, length, 0);
  if (queued != length) Serial.printf("Playback overflow: dropped %u bytes\n", length - queued);
}

void playbackTask(void *) {
  uint8_t monoBytes[1920];
  int16_t stereo[1920];

  while (true) {
    if (!playbackEnabled) {
      delay(1);
      continue;
    }

    if (!playbackStarted) {
      size_t available = xStreamBufferBytesAvailable(playbackBuffer);
      if (available == 0 || (!responseComplete && available < PLAYBACK_PREBUFFER_BYTES)) {
        delay(5);
        continue;
      }
      playbackStarted = true;
    }

    size_t bytes = xStreamBufferReceive(
      playbackBuffer,
      monoBytes,
      sizeof(monoBytes),
      pdMS_TO_TICKS(20)
    );
    if (bytes < 2) {
      if (playbackEnabled && responseComplete &&
          xStreamBufferBytesAvailable(playbackBuffer) == 0) {
        playbackEnabled = false;
        playbackStarted = false;
        responseComplete = false;
      } else if (playbackEnabled && playbackStarted) {
        playbackStarted = false;
        Serial.println("Playback underrun: rebuffering");
      }
      continue;
    }
    if (!playbackEnabled) continue;

    size_t samples = bytes / sizeof(int16_t);
    const int16_t *mono = reinterpret_cast<const int16_t *>(monoBytes);
    for (size_t i = 0; i < samples; ++i) {
      stereo[i * 2] = mono[i];
      stereo[i * 2 + 1] = mono[i];
    }

    size_t written = 0;
    i2s_write(
      DAC_I2S,
      stereo,
      samples * 2 * sizeof(int16_t),
      &written,
      portMAX_DELAY
    );
  }
}

void setupMic() {
  Serial.println("Setting up microphone...");
  i2s_config_t config = {
    .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 128,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0,
  };
  i2s_pin_config_t pins = {
    .mck_io_num = I2S_PIN_NO_CHANGE,
    .bck_io_num = MIC_BCLK,
    .ws_io_num = MIC_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = MIC_DATA,
  };

  if (i2s_driver_install(MIC_I2S, &config, 0, nullptr) != ESP_OK ||
      i2s_set_pin(MIC_I2S, &pins) != ESP_OK) {
    halt("Microphone I2S setup failed");
  }
  i2s_zero_dma_buffer(MIC_I2S);
  Serial.println("Microphone ready");
}

void setupSpeaker() {
  Serial.println("Setting up speaker...");

  Wire.begin(TLV_SDA, TLV_SCL);
  pinMode(TLV_RESET, OUTPUT);
  digitalWrite(TLV_RESET, LOW);
  delay(100);
  digitalWrite(TLV_RESET, HIGH);
  delay(100);

  // Keep the complete 16 kHz codec sequence from the known-good local sketch.
  if (!codec.begin() ||
      !codec.setCodecInterface(TLV320DAC3100_FORMAT_I2S, TLV320DAC3100_DATA_LEN_16) ||
      !codec.setCodecClockInput(TLV320DAC3100_CODEC_CLKIN_PLL) ||
      !codec.setPLLClockInput(TLV320DAC3100_PLL_CLKIN_BCLK) ||
      !codec.setPLLValues(1, 2, 32, 0) ||
      !codec.setNDAC(true, 8) ||
      !codec.setMDAC(true, 2) ||
      !codec.powerPLL(true) ||
      !codec.setDACDataPath(true, true, TLV320_DAC_PATH_NORMAL,
                            TLV320_DAC_PATH_NORMAL, TLV320_VOLUME_STEP_1SAMPLE) ||
      !codec.configureAnalogInputs(TLV320_DAC_ROUTE_MIXER, TLV320_DAC_ROUTE_MIXER,
                                   false, false, false, false) ||
      !codec.setDACVolumeControl(false, false, TLV320_VOL_INDEPENDENT) ||
      !codec.setChannelVolume(false, 0.0) ||
      !codec.setChannelVolume(true, 0.0) ||
      !codec.enableSpeaker(true) ||
      !codec.configureSPK_PGA(TLV320_SPK_GAIN_6DB, true) ||
      !codec.setSPKVolume(true, 0)) {
    halt("TLV320 configuration failed");
  }

  i2s_config_t config = {
    .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 12,
    .dma_buf_len = 256,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0,
  };
  i2s_pin_config_t pins = {
    .mck_io_num = I2S_PIN_NO_CHANGE,
    .bck_io_num = TLV_BCLK,
    .ws_io_num = TLV_WS,
    .data_out_num = TLV_DATA,
    .data_in_num = I2S_PIN_NO_CHANGE,
  };

  if (i2s_driver_install(DAC_I2S, &config, 0, nullptr) != ESP_OK ||
      i2s_set_pin(DAC_I2S, &pins) != ESP_OK) {
    halt("DAC I2S setup failed");
  }
  i2s_zero_dma_buffer(DAC_I2S);
  Serial.println("Speaker ready");
}

void handleText(const uint8_t *payload, size_t length) {
  String message(reinterpret_cast<const char *>(payload), length);
  Serial.printf("<- %s\n", message.c_str());

  if (message.startsWith("AUDIO_START")) startPlayback();
  else if (message.startsWith("AUDIO_END")) responseComplete = true;
}

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      socketConnected = true;
      reconnectMs = 1000;
      webSocket.setReconnectInterval(reconnectMs);
      webSocket.sendTXT("HELLO");
      Serial.println("Connected to Otto server");
      break;
    case WStype_DISCONNECTED:
      socketConnected = false;
      talking = false;
      stopPlayback();
      webSocket.setReconnectInterval(reconnectMs);
      reconnectMs = min(reconnectMs * 2, static_cast<uint32_t>(15000));
      Serial.println("Disconnected from Otto server");
      break;
    case WStype_TEXT:
      handleText(payload, length);
      break;
    case WStype_BIN:
      queuePlayback(payload, length);
      break;
    case WStype_ERROR:
      Serial.println("WebSocket error");
      break;
    default:
      break;
  }
}

void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }
  Serial.printf("\nWi-Fi ready: %s\n", WiFi.localIP().toString().c_str());
}

void setupWebSocket() {
  String path = String("/device?token=") + OTTO_DEVICE_TOKEN;
#if OTTO_USE_TLS
  webSocket.beginSSL(OTTO_HOST, OTTO_PORT, path.c_str());
#else
  webSocket.begin(OTTO_HOST, OTTO_PORT, path.c_str());
#endif
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(reconnectMs);
}

void beginTurn() {
  if (talking || !socketConnected) return;
  stopPlayback(); // FW-6: button input wins over output audio.
  talking = true;
  talkStartedAt = millis();
  i2s_zero_dma_buffer(MIC_I2S);
  webSocket.sendTXT("START");
  Serial.println("Listening");
}

void endTurn(bool cancel) {
  if (!talking) return;
  talking = false;
  webSocket.sendTXT(cancel ? "CANCEL" : "STOP");
  Serial.println(cancel ? "Cancelled" : "Thinking");
}

void readButton() {
  bool sample = digitalRead(BUTTON_PIN);
  uint32_t now = millis();
  if (sample != sampledButton) {
    sampledButton = sample;
    sampledButtonAt = now;
  }
  if (sample == stableButton || now - sampledButtonAt < DEBOUNCE_MS) return;

  stableButton = sample;
  if (stableButton == LOW) beginTurn();
  else endTurn(now - talkStartedAt < CANCEL_PRESS_MS);
}

void streamMicrophone() {
  size_t bytesRead = 0;
  if (i2s_read(MIC_I2S, micInput, sizeof(micInput), &bytesRead,
               pdMS_TO_TICKS(45)) != ESP_OK || bytesRead == 0) {
    return;
  }

  size_t samples = bytesRead / sizeof(int32_t);
  int64_t total = 0;
  for (size_t i = 0; i < samples; ++i) {
    total += micInput[i] >> 16;
  }

  int32_t dc = static_cast<int32_t>(total / static_cast<int64_t>(samples));
  int32_t peak = 1;
  for (size_t i = 0; i < samples; ++i) {
    int32_t centered = (micInput[i] >> 16) - dc;
    peak = max(peak, abs(centered));
  }

  for (size_t i = 0; i < samples; ++i) {
    int32_t centered = (micInput[i] >> 16) - dc;
    int32_t normalized = static_cast<int32_t>(centered * MIC_GAIN);
    micOutput[i] = static_cast<int16_t>(
      constrain(normalized, -32768, 32767)
    );
  }

  if (millis() - lastMicReportAt >= 500) {
    lastMicReportAt = millis();
    Serial.printf("Mic raw peak=%ld gain=%.2f\n", static_cast<long>(peak), MIC_GAIN);
  }
  webSocket.sendBIN(reinterpret_cast<uint8_t *>(micOutput),
                    samples * sizeof(int16_t));
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\nOtto ESP32 starting (%s)\n", FIRMWARE_VERSION);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  playbackBuffer = xStreamBufferCreate(PLAYBACK_BUFFER_BYTES, 1);
  if (!playbackBuffer) halt("Playback buffer allocation failed");

  setupMic();
  setupSpeaker();
  xTaskCreatePinnedToCore(playbackTask, "speaker", 8192, nullptr, 2, nullptr, 0);
  setupWiFi();
  setupWebSocket();
}

void loop() {
  webSocket.loop();
  readButton();

  if (talking && millis() - talkStartedAt >= MAX_TURN_MS) endTurn(false);
  if (talking && socketConnected) streamMicrophone();
  else delay(1);
}
