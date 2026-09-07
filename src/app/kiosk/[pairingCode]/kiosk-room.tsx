"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

type Status = "connecting" | "connected" | "error";

export function KioskRoom({ pairingCode }: { pairingCode: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);
  const [propertyAddress, setPropertyAddress] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

    async function join() {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "device", pairingCode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(data.error ?? "Nepodařilo se připojit.");
        }
        return;
      }

      const data = await res.json();
      if (cancelled) return;

      setPropertyName(data.propertyName ?? null);
      setPropertyAddress(data.propertyAddress ?? null);

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          audioContainerRef.current?.appendChild(element);
        }
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!room.canPlaybackAudio);
      });

      room.on(RoomEvent.Disconnected, () => {
        // Stop pretending we're live — without this, the heartbeat interval
        // below keeps firing (and the page keeps showing "Připojeno") even
        // though the actual LiveKit connection is gone, which makes a dead
        // tab indistinguishable from a working one.
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Spojení se přerušilo. Načti stránku znovu.");
        }
      });

      try {
        await room.connect(data.url, data.token);
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true, {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });

        const cameraTrack = room.localParticipant.getTrackPublication(
          Track.Source.Camera,
        )?.videoTrack;
        if (cameraTrack && videoRef.current) {
          cameraTrack.attach(videoRef.current);
        }

        if (!cancelled) {
          setStatus("connected");
          setAudioBlocked(!room.canPlaybackAudio);
        }

        heartbeatInterval = setInterval(() => {
          fetch("/api/devices/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pairingCode }),
          }).catch(() => {});
        }, 10_000);
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(
            err instanceof Error ? err.message : "Nepodařilo se připojit.",
          );
        }
      }
    }

    join();

    return () => {
      cancelled = true;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      room.disconnect();
    };
  }, [pairingCode]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(
      next,
      next ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : undefined,
    );
    setMicEnabled(next);
  }

  async function enableAudio() {
    const room = roomRef.current;
    if (!room) return;
    await room.startAudio();
    setAudioBlocked(!room.canPlaybackAudio);
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setCameraEnabled(next);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-4 text-white">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-[80vh] w-full max-w-3xl rounded-lg bg-gray-900"
      />
      <div ref={audioContainerRef} className="hidden" />

      {status === "connecting" && <p className="text-gray-400">Připojuji se...</p>}
      {status === "connected" && (
        <p className="text-sm text-gray-400">
          Připojeno{propertyName ? ` — ${propertyName}` : ""}
          {propertyAddress ? ` (${propertyAddress})` : ""}
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-400">{errorMessage}</p>
      )}

      {status === "connected" && audioBlocked && (
        <button
          type="button"
          onClick={enableAudio}
          className="rounded-md bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Prohlížeč zablokoval zvuk — klikni pro povolení
        </button>
      )}

      {status === "connected" && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={toggleMic}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              micEnabled ? "bg-gray-800 hover:bg-gray-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {micEnabled ? "Ztlumit mikrofon" : "Zapnout mikrofon"}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              cameraEnabled ? "bg-gray-800 hover:bg-gray-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {cameraEnabled ? "Vypnout kameru" : "Zapnout kameru"}
          </button>
        </div>
      )}
    </main>
  );
}
