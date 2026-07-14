import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

export function VoiceRecorderModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (durationSec: number, blob: Blob | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Microphone unavailable in this browser/context. Saving as a placeholder note.");
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onSave(seconds, blob);
      };
      recorder.stop();
    } else {
      onSave(seconds || 3, null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-[320px] text-center space-y-4">
        <h2 className="text-sm font-medium">Voice note</h2>
        {error && <p className="text-xs text-[var(--color-red-text)]">{error}</p>}
        <div className="text-3xl font-medium tabular-nums">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </div>
        <button
          onClick={recording ? stop : start}
          className="w-24 h-24 rounded-full mx-auto flex items-center justify-center text-white"
          style={{ background: recording ? "var(--color-red-solid)" : "var(--color-primary)" }}
        >
          {recording ? <Square size={28} /> : <Mic size={28} />}
        </button>
        <p className="text-xs text-[var(--color-ink-secondary)]">
          {recording ? "Recording — tap to stop" : "Tap to record"}
        </p>
        <button onClick={onClose} className="text-sm text-[var(--color-ink-secondary)] underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
