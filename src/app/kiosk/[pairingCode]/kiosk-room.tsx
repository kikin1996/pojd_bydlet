"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

type Status = "connecting" | "connected" | "error";

export function KioskRoom({ pairingCode }: { pairingCode: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);
  const [propertyAddress, setPropertyAddress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const room = new Room();
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

      try {
        await room.connect(data.url, data.token);
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);

        const cameraTrack = room.localParticipant.getTrackPublication(
          Track.Source.Camera,
        )?.videoTrack;
        if (cameraTrack && videoRef.current) {
          cameraTrack.attach(videoRef.current);
        }

        if (!cancelled) setStatus("connected");

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
    </main>
  );
}
