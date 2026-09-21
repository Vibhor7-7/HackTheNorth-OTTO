# Otto

A push-to-talk wearable that hands off real tasks by voice. Otto finds and
connects whatever tools the task needs, does the work, and texts you before
anything risky.

Built at Hack the North 2026. **`MainPRD.md` is the spec; read it first.**
`AGENTS.md` has the commands, the layout and the invariants.


**Composio Track Winner at HackTHeNorth

```sh
pnpm install
cp apps/server/.env.example apps/server/.env    # add OPENAI_API_KEY
pnpm dev                                        # server on :3000
pnpm fake-device                                # talk to it without the hardware
```
