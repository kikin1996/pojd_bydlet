"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from "livekit-client";

type Status = "connecting" | "connected" | "error";

interface VideoFeed {
  sid: string;
  room: string;
  track: RemoteTrack;
}

function roomLabelForParticipant(participant: RemoteParticipant): string {
  if (participant.metadata) {
    try {
      const parsed = JSON.parse(participant.metadata);
      if (typeof parsed.room === "string") return parsed.room;
    } catch {
      // fall through to default label below
    }
  }
  return "Byt";
}

function VideoTile({ feed }: { feed: VideoFeed }) {
  const attach = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el) feed.track.attach(el);
    },
    [feed.track],
  );

  return (
    <div className="relative overflow-hidden rounded-lg bg-gray-900">
      <video ref={attach} autoPlay playsInline className="w-full" />
      <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
        {feed.room}
      </span>
    </div>
  );
}

export function ViewerRoom({ propertyId }: { propertyId: string }) {
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<VideoFeed[]>([]);
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

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _publication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Video && track.sid) {
            const sid = track.sid;
            setFeeds((prev) =>
              prev.some((f) => f.sid === sid)
                ? prev
                : [...prev, { sid, room: roomLabelForParticipant(participant), track }],
            );
          } else if (track.kind === Track.Kind.Audio) {
            const element = track.attach();
            audioContainerRef.current?.appendChild(element);
          }
        },
      );

      // LiveKit unsubscribes a participant's tracks (firing this per track)
      // before it fires ParticipantDisconnected, so this alone keeps `feeds`
      // in sync when a room device goes offline — no separate handler needed.
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video) {
          setFeeds((prev) => prev.filter((f) => f.sid !== track.sid));
        }
        track.detach();
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
    await room.localParticipant.setMicrophoneEnabled(
      next,
      next ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : undefined,
    );
    setMicEnabled(next);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
        {feeds.map((feed) => (
          <VideoTile key={feed.sid} feed={feed} />
        ))}
      </div>
      {feeds.length === 0 && status === "connected" && (
        <p className="text-sm text-gray-400">Čekám na připojení zařízení v bytě...</p>
      )}
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
