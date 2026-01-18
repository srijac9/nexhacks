import { useState, useEffect, useRef, useCallback } from 'react';
import { Room, type Track } from 'livekit-client';
import { Video, X, Maximize2, Minimize2 } from 'lucide-react';
import CircuitButton from '@/components/CircuitButton';

interface PhoneVideoFeedProps {
  isOpen: boolean;
  onClose: () => void;
  onExpand?: () => void;
  isExpanded?: boolean;
}

const PhoneVideoFeed = ({ isOpen, onClose, onExpand, isExpanded = false }: PhoneVideoFeedProps) => {
  const [status, setStatus] = useState('Idle');
  const [room, setRoom] = useState<Room | null>(null);
  const [attachedVideoEl, setAttachedVideoEl] = useState<HTMLVideoElement | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const videoRef = useRef<HTMLDivElement>(null);

  const getToken = async (identity: string) => {
    const tokenUrl = `/token?identity=${encodeURIComponent(identity)}&t=${Date.now()}`;
    console.log('[PhoneVideoFeed] Fetching token from:', tokenUrl);
    const response = await fetch(tokenUrl);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PhoneVideoFeed] Token fetch failed:', response.status, errorText);
      throw new Error(`Token fetch failed: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log('[PhoneVideoFeed] Token response:', {
      url: data.url,
      room: data.room,
      hasToken: !!data.token,
      tokenPreview: data.token?.substring(0, 20) + '...'
    });
    return data;
  };

  const attachTrack = useCallback((track: Track) => {
    console.log('[PhoneVideoFeed] Attaching track:', track.kind, track.sid, 'muted:', track.isMuted);
    
    // Clean up previous video element safely
    setAttachedVideoEl((prevEl) => {
      if (prevEl) {
        try {
          // Detach the track from the previous element
          if (track.detach) {
            track.detach(prevEl);
          }
          // Remove from DOM if it has a parent
          if (prevEl.parentNode) {
            prevEl.parentNode.removeChild(prevEl);
          }
        } catch (e) {
          console.warn('[PhoneVideoFeed] Error cleaning up previous video element:', e);
        }
      }
      return null;
    });

    // Clear the container safely
    if (videoRef.current) {
      try {
        // Remove all children
        while (videoRef.current.firstChild) {
          videoRef.current.removeChild(videoRef.current.firstChild);
        }
      } catch (e) {
        console.warn('[PhoneVideoFeed] Error clearing container:', e);
        videoRef.current.innerHTML = '';
      }
    }

    // Attach the new track
    let videoElement: HTMLVideoElement;
    try {
      videoElement = track.attach();
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.className = 'w-full h-full object-contain rounded-lg';
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.display = 'block';

      if (videoRef.current) {
        videoRef.current.appendChild(videoElement);
      }

      setAttachedVideoEl(videoElement);

      // Handle play errors
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Ignore AbortError - it's common when video is removed/replaced
          if (err.name !== 'AbortError') {
            console.error('[PhoneVideoFeed] Video play error:', err);
          }
        });
      }
    } catch (e) {
      console.error('[PhoneVideoFeed] Error attaching track:', e);
      return;
    }

    // Handle track events
    track.on('unmuted', () => {
      console.log('[PhoneVideoFeed] Track unmuted');
      if (videoElement && videoRef.current) {
        // Ensure video is in the container
        if (videoElement.parentNode !== videoRef.current) {
          try {
            if (videoElement.parentNode) {
              videoElement.parentNode.removeChild(videoElement);
            }
            videoRef.current.appendChild(videoElement);
          } catch (e) {
            console.warn('[PhoneVideoFeed] Error reattaching video on unmute:', e);
          }
        }
        videoElement.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('[PhoneVideoFeed] Video play error on unmute:', err);
          }
        });
      }
    });

    track.on('muted', () => {
      console.log('[PhoneVideoFeed] Track muted');
    });

    track.on('ended', () => {
      console.log('[PhoneVideoFeed] Track ended');
      setStatus('Video track ended');
    });

    track.on('subscribed', () => {
      console.log('[PhoneVideoFeed] Track subscribed');
    });

    track.on('unsubscribed', () => {
      console.log('[PhoneVideoFeed] Track unsubscribed');
      // Clean up when track is unsubscribed
      if (videoElement && videoElement.parentNode) {
        try {
          videoElement.parentNode.removeChild(videoElement);
        } catch (e) {
          // Ignore errors if already removed
        }
      }
      setAttachedVideoEl(null);
    });
  }, []);

  const handleConnect = useCallback(async () => {
    try {
      setStatus('Getting token...');
      console.log('[PhoneVideoFeed] Requesting token for identity: laptop');
      const data = await getToken('laptop');
      console.log('[PhoneVideoFeed] Token received:', {
        url: data.url,
        room: data.room,
        hasToken: !!data.token,
        tokenLength: data.token?.length
      });

      setStatus('Connecting to LiveKit...');
      console.log('[PhoneVideoFeed] Creating Room instance');
      const roomConn = new Room({ adaptiveStream: false, dynacast: false });
      
      console.log('[PhoneVideoFeed] Connecting to:', data.url);
      await roomConn.connect(data.url, data.token);
      console.log('[PhoneVideoFeed] Connected to room:', roomConn.name);
      console.log('[PhoneVideoFeed] Local participant:', roomConn.localParticipant.identity);
      
      const debugMsg = `Room: ${roomConn.name}, Local: ${roomConn.localParticipant.identity}, Remote: ${roomConn.remoteParticipants.size}`;
      setDebugInfo(debugMsg);
      console.log('[PhoneVideoFeed]', debugMsg);

      setStatus('Waiting for phone video...');

      // Log all remote participants
      console.log('[PhoneVideoFeed] Remote participants count:', roomConn.remoteParticipants.size);
      roomConn.remoteParticipants.forEach((participant) => {
        console.log('[PhoneVideoFeed] Remote participant:', {
          identity: participant.identity,
          sid: participant.sid,
          trackPublications: participant.trackPublications.size
        });
      });

      // Handle new track subscriptions
      roomConn.on('trackSubscribed', (track, publication, participant) => {
        console.log('[PhoneVideoFeed] Track subscribed:', {
          kind: track.kind,
          sid: track.sid,
          participantIdentity: participant.identity,
          participantSid: participant.sid,
          publicationKind: publication.kind,
          isMuted: track.isMuted,
          isSubscribed: publication.isSubscribed
        });
        
        if (track.kind === 'video') {
          console.log('[PhoneVideoFeed] Attaching video track from:', participant.identity);
          attachTrack(track);
          setStatus('Video connected ✓');
        }
      });

      // Handle track unsubscribed
      roomConn.on('trackUnsubscribed', (track, publication, participant) => {
        console.log('[PhoneVideoFeed] Track unsubscribed:', {
          kind: track.kind,
          participantIdentity: participant.identity,
          trackSid: track.sid,
          publicationKind: publication.kind
        });
        
        if (track.kind === 'video') {
          // Don't immediately clean up - the track might be republished
          // Just update status and wait a moment
          setStatus('Video disconnected, waiting for reconnection...');
          
          // Check if there are other video tracks available
          setTimeout(() => {
            if (roomConn && roomConn.remoteParticipants.size > 0) {
              roomConn.remoteParticipants.forEach((p) => {
                p.trackPublications.forEach((pub) => {
                  if (pub.kind === 'video' && pub.track) {
                    console.log('[PhoneVideoFeed] Found video track after unsubscribe, reattaching...');
                    attachTrack(pub.track);
                    setStatus('Video reconnected ✓');
                  } else if (pub.kind === 'video' && !pub.isSubscribed) {
                    console.log('[PhoneVideoFeed] Resubscribing to video track...');
                    pub.setSubscribed(true);
                  }
                });
              });
            }
          }, 500);
        }
      });

      // Check for existing participants and their tracks
      roomConn.remoteParticipants.forEach((participant) => {
        console.log('[PhoneVideoFeed] Checking existing participant:', participant.identity);
        console.log('[PhoneVideoFeed] Track publications:', participant.trackPublications.size);
        
        participant.trackPublications.forEach((publication) => {
          console.log('[PhoneVideoFeed] Publication:', {
            kind: publication.kind,
            trackSid: publication.trackSid,
            isSubscribed: publication.isSubscribed,
            hasTrack: !!publication.track,
            isMuted: publication.isMuted
          });
          
          // Always try to subscribe to video tracks
          if (publication.kind === 'video') {
            if (!publication.isSubscribed) {
              console.log('[PhoneVideoFeed] Subscribing to video publication from:', participant.identity);
              publication.setSubscribed(true);
            }
            
            if (publication.track) {
              console.log('[PhoneVideoFeed] Found existing video track from', participant.identity);
              attachTrack(publication.track);
              setStatus('Video connected ✓');
            } else {
              console.log('[PhoneVideoFeed] Video publication exists but track not available yet, waiting for trackSubscribed event...');
            }
          }
        });
      });

      // Handle new participants joining
      roomConn.on('participantConnected', (participant) => {
        console.log('[PhoneVideoFeed] New participant connected:', {
          identity: participant.identity,
          sid: participant.sid,
          trackPublications: participant.trackPublications.size
        });
        
        participant.trackPublications.forEach((publication) => {
          console.log('[PhoneVideoFeed] New participant publication:', {
            kind: publication.kind,
            isSubscribed: publication.isSubscribed,
            hasTrack: !!publication.track
          });
          
          // Subscribe to video tracks
          if (publication.kind === 'video') {
            if (!publication.isSubscribed) {
              console.log('[PhoneVideoFeed] Subscribing to video publication from:', participant.identity);
              publication.setSubscribed(true);
            }
            
            if (publication.track) {
              console.log('[PhoneVideoFeed] Video track from new participant:', participant.identity);
              attachTrack(publication.track);
              setStatus('Video connected ✓');
            }
          }
        });
      });

      // Handle participant disconnected
      roomConn.on('participantDisconnected', (participant) => {
        console.log('[PhoneVideoFeed] Participant disconnected:', participant.identity);
        
        // Clean up video if this was the phone
        if (participant.identity === 'phone') {
          setAttachedVideoEl((prevEl) => {
            if (prevEl) {
              try {
                if (prevEl.parentNode) {
                  prevEl.parentNode.removeChild(prevEl);
                }
              } catch (e) {
                // Ignore
              }
            }
            return null;
          });
          
          if (videoRef.current) {
            try {
              while (videoRef.current.firstChild) {
                videoRef.current.removeChild(videoRef.current.firstChild);
              }
            } catch (e) {
              videoRef.current.innerHTML = '';
            }
          }
        }
        
        setStatus('Phone disconnected');
      });

      // Handle track published
      roomConn.on('trackPublished', (publication, participant) => {
        console.log('[PhoneVideoFeed] Track published:', {
          kind: publication.kind,
          participantIdentity: participant.identity,
          trackSid: publication.trackSid,
          isSubscribed: publication.isSubscribed
        });
        
        if (publication.kind === 'video') {
          console.log('[PhoneVideoFeed] Video track published, subscribing...');
          // Subscribe to the track
          publication.setSubscribed(true);
          
          // If track is already available, attach it immediately
          if (publication.track) {
            console.log('[PhoneVideoFeed] Track already available, attaching...');
            attachTrack(publication.track);
            setStatus('Video connected ✓');
          }
        }
      });

      // Handle track unpublished
      roomConn.on('trackUnpublished', (publication, participant) => {
        console.log('[PhoneVideoFeed] Track unpublished:', publication.kind, 'from', participant.identity);
      });

      // Set up periodic check for video tracks (in case they get unsubscribed)
      const trackCheckInterval = setInterval(() => {
        if (roomConn && roomConn.state === 'connected') {
          let hasVideoTrack = false;
          roomConn.remoteParticipants.forEach((participant) => {
            participant.trackPublications.forEach((publication) => {
              if (publication.kind === 'video') {
                if (!publication.isSubscribed) {
                  console.log('[PhoneVideoFeed] Periodic check: Resubscribing to video track');
                  publication.setSubscribed(true);
                }
                if (publication.track && !attachedVideoEl) {
                  console.log('[PhoneVideoFeed] Periodic check: Found video track, attaching');
                  attachTrack(publication.track);
                  setStatus('Video connected ✓');
                  hasVideoTrack = true;
                } else if (publication.track) {
                  hasVideoTrack = true;
                }
              }
            });
          });
          
          if (!hasVideoTrack && attachedVideoEl) {
            console.log('[PhoneVideoFeed] Periodic check: No video track found but element exists');
          }
        }
      }, 2000); // Check every 2 seconds

      // Store interval ID for cleanup
      (roomConn as any)._trackCheckInterval = trackCheckInterval;

      setRoom(roomConn);
    } catch (e: any) {
      console.error('[PhoneVideoFeed] Connection error:', e);
      setStatus(`Connect failed: ${e.message}`);
    }
  }, [attachTrack, attachedVideoEl]);

  const handleDisconnect = useCallback(() => {
    if (room) {
      // Clear track check interval
      if ((room as any)._trackCheckInterval) {
        clearInterval((room as any)._trackCheckInterval);
      }

      // Clean up video element before disconnecting
      setAttachedVideoEl((prevEl) => {
        if (prevEl) {
          try {
            if (prevEl.parentNode) {
              prevEl.parentNode.removeChild(prevEl);
            }
          } catch (e) {
            // Ignore errors
          }
        }
        return null;
      });

      // Clear container
      if (videoRef.current) {
        try {
          while (videoRef.current.firstChild) {
            videoRef.current.removeChild(videoRef.current.firstChild);
          }
        } catch (e) {
          videoRef.current.innerHTML = '';
        }
      }

      room.disconnect();
      setRoom(null);
      setStatus('Disconnected');
    }
  }, [room]);

  // Auto-connect when modal opens
  useEffect(() => {
    if (isOpen && !room) {
      console.log('[PhoneVideoFeed] Modal opened, connecting...');
      handleConnect();
    } else if (isOpen && room) {
      console.log('[PhoneVideoFeed] Modal opened, already connected');
    }
  }, [isOpen, room, handleConnect]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && room) {
      handleDisconnect();
    }
  }, [isOpen, room, handleDisconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up video element
      setAttachedVideoEl((prevEl) => {
        if (prevEl) {
          try {
            if (prevEl.parentNode) {
              prevEl.parentNode.removeChild(prevEl);
            }
          } catch (e) {
            // Ignore errors
          }
        }
        return null;
      });

      // Clean up room connection
      if (room) {
        try {
          room.disconnect();
        } catch (e) {
          console.warn('[PhoneVideoFeed] Error disconnecting on unmount:', e);
        }
      }
    };
  }, [room]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        isExpanded
          ? 'inset-4'
          : 'bottom-4 right-4 w-96'
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
                handleDisconnect();
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

        {/* Video Container */}
        <div className="flex-1 p-4 overflow-hidden flex items-center justify-center">
          <div
            ref={videoRef}
            className={`w-full h-full min-h-[200px] bg-card/30 border-2 border-dashed border-border rounded-lg flex items-center justify-center ${
              attachedVideoEl ? 'border-solid' : ''
            }`}
            style={{ aspectRatio: '16/9' }}
          >
            {!attachedVideoEl && (
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
          {room ? (
            <>
              <CircuitButton
                onClick={() => {
                  // Manual refresh - check for tracks
                  console.log('[PhoneVideoFeed] Manual refresh triggered');
                  if (room) {
                    console.log('[PhoneVideoFeed] Remote participants:', room.remoteParticipants.size);
                    room.remoteParticipants.forEach((participant) => {
                      console.log('[PhoneVideoFeed] Participant:', participant.identity, 'Tracks:', participant.trackPublications.size);
                      participant.trackPublications.forEach((publication) => {
                        if (publication.kind === 'video') {
                          console.log('[PhoneVideoFeed] Video publication:', {
                            isSubscribed: publication.isSubscribed,
                            hasTrack: !!publication.track,
                            trackSid: publication.trackSid
                          });
                          if (!publication.isSubscribed) {
                            publication.setSubscribed(true);
                          }
                          if (publication.track) {
                            attachTrack(publication.track);
                          }
                        }
                      });
                    });
                    const debugMsg = `Room: ${room.name}, Remote: ${room.remoteParticipants.size}`;
                    setDebugInfo(debugMsg);
                  }
                }}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Refresh Tracks
              </CircuitButton>
              <CircuitButton
                onClick={handleDisconnect}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                Disconnect
              </CircuitButton>
            </>
          ) : (
            <CircuitButton
              onClick={handleConnect}
              size="sm"
              className="w-full"
            >
              Connect
            </CircuitButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhoneVideoFeed;

