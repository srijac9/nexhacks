import { useState, useEffect, useRef, useCallback } from "react";
import {
  Room,
  type Track,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";
import { Video, X, Maximize2, Minimize2 } from "lucide-react";
import CircuitButton from "@/components/CircuitButton";

interface PhoneVideoFeedProps {
  isOpen: boolean;
  onClose: () => void;
  onExpand?: () => void;
  isExpanded?: boolean;
}

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE?.trim?.() || "http://localhost:3000";

export default function PhoneVideoFeed({
  isOpen,
  onClose,
  onExpand,
  isExpanded = false,
}: PhoneVideoFeedProps) {
  const [status, setStatus] = useState("Idle");
  const [debugInfo, setDebugInfo] = useState("");
  const [isVideoAttached, setIsVideoAttached] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const attachedTrackRef = useRef<Track | null>(null);

  const getToken = useCallback(async (identity: string) => {
    const tokenUrl = `${API_BASE}/token?identity=${encodeURIComponent(
      identity
    )}&t=${Date.now()}`;
    console.log("[PhoneVideoFeed] Fetching token from:", tokenUrl);

    const res = await fetch(tokenUrl);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Token fetch failed: ${res.status} - ${text}`);
    }
    return (await res.json()) as { token: string; url: string; room: string };
  }, []);

  const detachCurrent = useCallback(() => {
    const el = videoElRef.current;
    const t = attachedTrackRef.current;
    try {
      if (t && el) {
        // detach ONLY from our known element
        (t as any).detach?.(el);
      }
    } catch (e) {
      console.warn("[PhoneVideoFeed] detach warning:", e);
    }
    attachedTrackRef.current = null;
    setIsVideoAttached(false);

    // stop showing old frozen frame
    if (el) {
      try {
        el.srcObject = null;
      } catch {}
    }
  }, []);

  const attachTrackToVideo = useCallback(
    (track: Track, from?: string) => {
      if (track.kind !== "video") return;

      const el = videoElRef.current;
      if (!el) {
        console.warn("[PhoneVideoFeed] video element not ready yet");
        return;
      }

      console.log(
        "[PhoneVideoFeed] Attaching video track",
        (track as any).sid,
        "from",
        from
      );

      // Detach any previous track from THIS element
      detachCurrent();

      try {
        // Attach track to our <video> element (React-owned)
        (track as any).attach(el);
        attachedTrackRef.current = track;
        setIsVideoAttached(true);

        // Try to play
        const p = el.play();
        if (p && typeof (p as any).catch === "function") {
          p.catch((err: any) => {
            if (err?.name !== "AbortError") {
              console.warn("[PhoneVideoFeed] video.play() failed:", err);
            }
          });
        }

        el.onloadedmetadata = () => {
          console.log(
            "[PhoneVideoFeed] loadedmetadata:",
            el.videoWidth,
            el.videoHeight
          );
        };
      } catch (e) {
        console.error("[PhoneVideoFeed] attach failed:", e);
        setStatus("Failed to attach video");
      }

      track.on("muted", () => setStatus("Video muted (network hiccup)…"));
      track.on("unmuted", () => {
        setStatus("Video resumed ✓");
        videoElRef.current?.play().catch(() => {});
      });
      track.on("ended", () => {
        setStatus("Video ended");
        detachCurrent();
      });
    },
    [detachCurrent]
  );

  const subscribeExisting = useCallback(
    (room: Room) => {
      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        p.trackPublications.forEach((pub: RemoteTrackPublication) => {
          if (pub.kind === "video") {
            if (!pub.isSubscribed) pub.setSubscribed(true);
            if (pub.track) {
              attachTrackToVideo(pub.track, p.identity);
              setStatus("Video connected ✓");
            }
          }
        });
      });
    },
    [attachTrackToVideo]
  );

  const connect = useCallback(async () => {
    if (roomRef.current?.state === "connected") return;

    setStatus("Getting token...");
    const data = await getToken("laptop");

    setStatus("Connecting to LiveKit...");
    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
    });

    await room.connect(data.url, data.token);
    roomRef.current = room;

    setDebugInfo(
      `Room: ${room.name}, Local: ${room.localParticipant.identity}, Remote: ${room.remoteParticipants.size}`
    );

    setStatus("Waiting for phone video...");

    room.on("trackSubscribed", (track, _pub, participant) => {
      console.log("[PhoneVideoFeed] trackSubscribed", track.kind, participant.identity);
      if (track.kind === "video") {
        attachTrackToVideo(track, participant.identity);
        setStatus("Video connected ✓");
      }
    });

    room.on("trackUnsubscribed", (track, _pub, participant) => {
      console.log("[PhoneVideoFeed] trackUnsubscribed", track.kind, participant.identity);
      if (track.kind === "video") {
        setStatus("Video disconnected, waiting...");
        detachCurrent();
      }
    });

    room.on("participantDisconnected", (p) => {
      if (p.identity === "phone") {
        setStatus("Phone disconnected");
        detachCurrent();
      }
    });

    // In case phone was already publishing before we connected:
    subscribeExisting(room);
  }, [getToken, attachTrackToVideo, detachCurrent, subscribeExisting]);

  const disconnect = useCallback(() => {
    detachCurrent();
    roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus("Disconnected");
  }, [detachCurrent]);

  useEffect(() => {
    if (!isOpen) return;
    connect().catch((e) => setStatus(`Connect failed: ${e?.message || String(e)}`));
    return () => {
      disconnect();
    };
  }, [isOpen, connect, disconnect]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        isExpanded ? "inset-4" : "bottom-4 right-4 w-96"
      }`}
    >
      <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" />
            <span className="font-mono text-sm font-semibold">Phone Camera Feed</span>
          </div>
          <div className="flex items-center gap-2">
            {onExpand && (
              <CircuitButton
                variant="ghost"
                size="sm"
                onClick={onExpand}
                className="h-8 w-8 p-0"
              >
                {isExpanded ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </CircuitButton>
            )}
            <CircuitButton
              variant="ghost"
              size="sm"
              onClick={() => {
                disconnect();
                onClose();
              }}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </CircuitButton>
          </div>
        </div>

        {/* Status */}
        <div className="px-4 py-2 border-b border-border space-y-1">
          <p className="font-mono text-xs text-muted-foreground">
            Status: <span className="text-primary">{status}</span>
          </p>
          {debugInfo && (
            <p className="font-mono text-xs text-muted-foreground">
              Debug: <span className="text-secondary">{debugInfo}</span>
            </p>
          )}
        </div>

        {/* Video */}
        <div className="flex-1 p-4 overflow-hidden flex items-center justify-center">
          <div
            className={`w-full h-full min-h-[200px] bg-card/30 border-2 border-dashed border-border rounded-lg flex items-center justify-center ${
              isVideoAttached ? "border-solid" : ""
            }`}
            style={{ aspectRatio: "16/9" }}
          >
            <video
              ref={videoElRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain rounded-lg"
              style={{ display: isVideoAttached ? "block" : "none" }}
            />
            {!isVideoAttached && (
              <div className="text-center p-4">
                <Video className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground font-mono text-xs">
                  Waiting for phone video...
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 border-t border-border space-y-2">
          {roomRef.current ? (
            <>
              <CircuitButton
                onClick={() => {
                  const r = roomRef.current;
                  if (!r) return;
                  subscribeExisting(r);
                  setDebugInfo(`Room: ${r.name}, Remote: ${r.remoteParticipants.size}`);
                }}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                Refresh Tracks
              </CircuitButton>
              <CircuitButton
                onClick={disconnect}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                Disconnect
              </CircuitButton>
            </>
          ) : (
            <CircuitButton onClick={() => connect()} size="sm" className="w-full">
              Connect
            </CircuitButton>
          )}
        </div>
      </div>
    </div>
  );
}
