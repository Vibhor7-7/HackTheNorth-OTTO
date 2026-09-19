# fake-device (DEV-1)

Speaks the Section 7.1 device protocol from a laptop. Unblocks all server work
from the hardware and is the stage fallback if the device dies (Section 15).

```sh
pnpm fake-device                      # ws://localhost:3000/device
OTTO_URL=wss://otto.example.com pnpm fake-device
```

Needs `ffmpeg` and `ffplay` on PATH: `brew install ffmpeg`.

| Key     | Does                                                    |
|---------|---------------------------------------------------------|
| `space` | hold-to-talk: press to `ptt_start`, press again to `ptt_end` |
| `c`     | `ptt_cancel`                                            |
| `p`     | `ping`                                                  |
| `q`     | quit                                                    |

Audio is PCM s16le mono 24 kHz in both directions, exactly as FW-3 and VG-4
specify, so no resampling happens anywhere.
