import { create } from "zustand";

export const VOICE_EFFECTS = ["none", "deep", "high", "robot"] as const;
export type VoiceEffect = (typeof VOICE_EFFECTS)[number];

const KEY = "six:voice-effect";

const SETTINGS: Record<VoiceEffect, { pitch: number; ring: number }> = {
  none: { pitch: 1, ring: 0 },
  deep: { pitch: 0.7, ring: 0 },
  high: { pitch: 1.5, ring: 0 },
  robot: { pitch: 1, ring: 50 },
};

/**
 * Shifts the pitch with two read heads sweeping a short delay line, crossfaded so each one is silent when it
 * jumps back, then ring-modulates for the robot voice.
 */
const WORKLET = `
const W = 2048;
registerProcessor("voice-fx", class extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "pitch", defaultValue: 1 }, { name: "ring", defaultValue: 0 }];
  }
  buf = new Float32Array(W * 2);
  w = 0;
  d = 0;
  t = 0;
  process([input], [output], { pitch, ring }) {
    const x = input[0];
    if (!x) return true;
    const y = output[0], buf = this.buf, n = buf.length, p = pitch[0], r = ring[0];
    const read = (d) => {
      const at = this.w - d + n, i = Math.floor(at), f = at - i;
      return buf[i % n] * (1 - f) + buf[(i + 1) % n] * f;
    };
    for (let i = 0; i < x.length; i++) {
      buf[this.w] = x[i];
      let v = x[i];
      if (p !== 1) {
        this.d = (this.d + 1 - p + W) % W;
        const g = Math.sin((Math.PI * this.d) / W) ** 2;
        v = g * read(this.d) + (1 - g) * read((this.d + W / 2) % W);
      }
      if (r) {
        v *= Math.sin(this.t);
        this.t = (this.t + (2 * Math.PI * r) / sampleRate) % (2 * Math.PI);
      }
      y[i] = v;
      this.w = (this.w + 1) % n;
    }
    return true;
  }
});
`;

let moduleUrl: string | null = null;

function load(): VoiceEffect {
  try {
    const saved = localStorage.getItem(KEY);
    return VOICE_EFFECTS.find((e) => e === saved) ?? "none";
  } catch {
    return "none";
  }
}

/** The voice effect for voice messages and calls, remembered on this device. */
export const useVoiceEffect = create<{ effect: VoiceEffect; set: (effect: VoiceEffect) => void }>((set) => ({
  effect: typeof window === "undefined" ? "none" : load(),
  set(effect) {
    try {
      localStorage.setItem(KEY, effect);
    } catch {}
    set({ effect });
  },
}));

async function effectNode(ctx: AudioContext) {
  moduleUrl ??= URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(moduleUrl);
  const node = new AudioWorkletNode(ctx, "voice-fx", { outputChannelCount: [1] });
  const apply = (effect: VoiceEffect) => {
    node.parameters.get("pitch")!.value = SETTINGS[effect].pitch;
    node.parameters.get("ring")!.value = SETTINGS[effect].ring;
  };
  return { node, apply };
}

/**
 * Sends what `el` plays through a voice effect, to hear a voice message differently; `apply` changes the effect.
 * From then on `el` only sounds through Web Audio, so "none" keeps it routed but untouched.
 */
export async function playThroughEffect(el: HTMLMediaElement) {
  const ctx = new AudioContext();
  void ctx.resume();
  const { node, apply } = await effectNode(ctx);
  ctx.createMediaElementSource(el).connect(node).connect(ctx.destination);
  return { apply, close: () => void ctx.close().catch(() => null) };
}

export interface VoiceFx {
  stream: MediaStream;
  stop: () => void;
  disguised: boolean;
}

/**
 * Runs the microphone of `input` through the chosen voice effect, following later changes to it. The stream
 * keeps any video tracks of `input`, and `stop` releases everything. With no effect chosen, or where Web Audio
 * fails, `input` comes back untouched.
 */
export async function withVoiceEffect(input: MediaStream): Promise<VoiceFx> {
  const stopInput = () => input.getTracks().forEach((t) => t.stop());
  if (useVoiceEffect.getState().effect === "none") return { stream: input, stop: stopInput, disguised: false };
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
    void ctx.resume();
    const { node, apply } = await effectNode(ctx);
    const out = ctx.createMediaStreamDestination();
    ctx.createMediaStreamSource(input).connect(node).connect(out);
    apply(useVoiceEffect.getState().effect);
    const unsubscribe = useVoiceEffect.subscribe(({ effect }) => apply(effect));
    const stream = new MediaStream([...out.stream.getTracks(), ...input.getVideoTracks()]);
    const audio = ctx;
    return {
      stream,
      disguised: true,
      stop() {
        unsubscribe();
        stream.getTracks().forEach((t) => t.stop());
        stopInput();
        void audio.close().catch(() => null);
      },
    };
  } catch {
    void ctx?.close().catch(() => null);
    return { stream: input, stop: stopInput, disguised: false };
  }
}
