"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

type Status = "connecting" | "connected" | "error";

export function ViewerRoom({ propertyId }: { propertyId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    async function join() {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer", propertyId }),
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

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          setDeviceConnected(true);
        } else if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          audioContainerRef.current?.appendChild(element);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video) {
          setDeviceConnected(false);
        }
        track.detach();
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        setDeviceConnected(room.remoteParticipants.size > 0);
      });

      try {
        await room.connect(data.url, data.token);
        if (!cancelled) setStatus("connected");
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
      room.disconnect();
    };
  }, [propertyId]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-lg bg-gray-900">
        <video ref={videoRef} autoPlay playsInline className="w-full" />
        {!deviceConnected && status === "connected" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Čekám na připojení zařízení v bytě...
          </div>
        )}
      </div>
      <div ref={audioContainerRef} className="hidden" />

      {status === "connecting" && <p className="text-gray-500">Připojuji se...</p>}
      {status === "error" && <p className="text-sm text-red-600">{errorMessage}</p>}

      {status === "connected" && (
        <button
          type="button"
          onClick={toggleMic}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
            micEnabled ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-800"
          }`}
        >
          {micEnabled ? "Vypnout mikrofon" : "Zapnout mikrofon a mluvit"}
        </button>
      )}
    </div>
  );
}
