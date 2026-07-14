import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";

export function PhotoCaptureModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (blob: Blob | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        setError("Camera unavailable in this browser/context. Saving as a placeholder photo.");
      }
    }
    void init();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    if (!ready || !videoRef.current) {
      onSave(null);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 320;
    canvas.height = videoRef.current.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => onSave(blob), "image/jpeg", 0.85);
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
      <div className="w-full max-w-[360px] px-4 space-y-4">
        <div className="aspect-[4/3] bg-black rounded-xl overflow-hidden flex items-center justify-center">
          {error ? (
            <p className="text-white text-sm text-center p-4">{error}</p>
          ) : (
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          )}
        </div>
        <button
          onClick={capture}
          className="camera-shutter mx-auto flex h-20 w-20 items-center justify-center rounded-full"
        >
          <Camera size={28} />
        </button>
        <button onClick={onClose} className="block mx-auto text-sm text-white underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
