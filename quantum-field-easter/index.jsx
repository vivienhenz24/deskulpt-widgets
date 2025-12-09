import { useState, useEffect, useRef, useCallback } from "@deskulpt-test/react";

// --- MEDIAPIPE IMPORTS ---
import HandsModule from "https://esm.sh/@mediapipe/hands";
const { Hands } = HandsModule;

const QuantumField = () => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  // State
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState("SYSTEM IDLE");
  const [videoPortals, setVideoPortals] = useState([]);
  
  // Gesture tracking refs
  const gestureHistory = useRef([]);
  const lastGestureTime = useRef(0);

  // Refs
  const particles = useRef([]);
  const cursor = useRef({
    x: -1000,
    y: -1000,
    smoothX: -1000,
    smoothY: -1000,
    active: false,
    type: "open",
  });
  const animationFrameId = useRef(0);
  const handsInstance = useRef(null);
  const dims = useRef({ w: 0, h: 0 });

  // --- CONFIGURATION ---
  const CONFIG = {
    spacing: 30,
    mouseRadius: 220,
    friction: 0.92,
    elasticity: 0.04,
    smoothing: 0.2,
  };

  // --- GESTURE DETECTION ---
  const detectVerticalGesture = useCallback((y) => {
    const now = Date.now();
    
    // Add current position to history
    gestureHistory.current.push({ y, time: now });
    
    // Keep only last 30 positions (about 1 second of data)
    if (gestureHistory.current.length > 30) {
      gestureHistory.current.shift();
    }
    
    // Need at least 15 points to detect gesture
    if (gestureHistory.current.length < 15) return;
    
    // Small cooldown to prevent same gesture from triggering multiple times (200ms)
    if (now - lastGestureTime.current < 200) return;
    
    // Analyze the motion pattern
    const history = gestureHistory.current;
    let peaks = 0;
    let valleys = 0;
    
    for (let i = 2; i < history.length - 2; i++) {
      const prev = history[i - 1].y;
      const curr = history[i].y;
      const next = history[i + 1].y;
      
      // Detect peaks (going up then down)
      if (curr < prev && curr < next && Math.abs(prev - next) > 50) {
        peaks++;
      }
      
      // Detect valleys (going down then up)
      if (curr > prev && curr > next && Math.abs(prev - next) > 50) {
        valleys++;
      }
    }
    
    // "Six seven" gesture: detect oscillation (at least 2 peaks or valleys)
    if (peaks >= 2 || valleys >= 2) {
      lastGestureTime.current = now;
      gestureHistory.current = []; // Reset history
      
      // Add a new portal
      const portalId = Date.now() + Math.random();
      setVideoPortals(prev => [...prev, portalId]);
      setStatus("PORTAL OPENING...");
      
      // Auto-remove this portal after 2 seconds
      setTimeout(() => {
        setVideoPortals(prev => prev.filter(id => id !== portalId));
        setStatus(cursor.current.active ? "REPULSION FIELD" : "SEARCHING...");
      }, 2000);
    }
  }, []);

  // --- PARTICLE LOGIC (Unchanged) ---
  class Particle {
    constructor(x, y) {
      this.x = this.homeX = x;
      this.y = this.homeY = y;
      this.vx = 0;
      this.vy = 0;
    }

    update(cursorX, cursorY, isPinching, isActive, time) {
      if (isActive && cursor.current.active) {
        const dx = cursorX - this.x;
        const dy = cursorY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.mouseRadius) {
          const force = (CONFIG.mouseRadius - dist) / CONFIG.mouseRadius;
          const angle = Math.atan2(dy, dx);
          const dir = isPinching ? 1 : -1;
          const power = isPinching ? 12 : 25;

          this.vx += Math.cos(angle) * force * power * dir;
          this.vy += Math.sin(angle) * force * power * dir;
        }
      } else {
        const wave =
          Math.sin(this.x * 0.01 + this.y * 0.01 + time * 0.001) * 0.2;
        this.vx += Math.cos(time * 0.001) * wave;
        this.vy += Math.sin(time * 0.001) * wave;
      }

      this.vx += (this.homeX - this.x) * CONFIG.elasticity;
      this.vy += (this.homeY - this.y) * CONFIG.elasticity;
      this.vx *= CONFIG.friction;
      this.vy *= CONFIG.friction;
      this.x += this.vx;
      this.y += this.vy;
    }

    draw(ctx, isActive, isPinching, colors) {
      const speed = Math.abs(this.vx) + Math.abs(this.vy);

      let size = 1.5;
      let alpha = 0.4;
      let color = colors.idle;

      if (speed > 0.3) {
        size = isActive ? 3.5 : 2.5;
        alpha = Math.min(speed / 4, 1);

        if (isActive && cursor.current.active) {
          color = isPinching ? colors.pinch : colors.active;
          ctx.shadowBlur = 12;
          ctx.shadowColor = color;
        } else {
          color = colors.activeIdle;
          alpha = alpha * 0.6;
          ctx.shadowBlur = 0;
        }
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;

      ctx.beginPath();
      ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
    }
  }

  // --- INITIALIZATION ---
  const initGrid = useCallback(() => {
    if (!containerRef.current || !canvasRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    dims.current = { w: clientWidth, h: clientHeight };
    canvasRef.current.width = clientWidth;
    canvasRef.current.height = clientHeight;

    const newParticles = [];
    for (let y = 0; y < clientHeight; y += CONFIG.spacing) {
      for (let x = 0; x < clientWidth; x += CONFIG.spacing) {
        newParticles.push(new Particle(x, y));
      }
    }
    particles.current = newParticles;
  }, []);

  // --- ANIMATION LOOP ---
  const animate = useCallback(
    (time) => {
      if (!canvasRef.current || !containerRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      const { w, h } = dims.current;

      const style = getComputedStyle(containerRef.current);
      const colors = {
        idle: style.getPropertyValue("--green-8") || "#004400",
        activeIdle: style.getPropertyValue("--green-10") || "#008800",
        active: style.getPropertyValue("--green-11") || "#00FF66",
        pinch: style.getPropertyValue("--red-11") || "#FF0044",
      };

      ctx.clearRect(0, 0, w, h);

      const c = cursor.current;
      const targetX = isActive && c.active ? c.x : -1000;
      const targetY = isActive && c.active ? c.y : -1000;

      c.smoothX += (targetX - c.smoothX) * CONFIG.smoothing;
      c.smoothY += (targetY - c.smoothY) * CONFIG.smoothing;

      const isPinching = c.type === "pinch";

      particles.current.forEach((p) => {
        p.update(c.smoothX, c.smoothY, isPinching, isActive, time);
        p.draw(ctx, isActive, isPinching, colors);
      });

      if (isActive && c.active) {
        const color = isPinching ? colors.pinch : colors.active;
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.arc(c.smoothX, c.smoothY, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.moveTo(c.smoothX - 35, c.smoothY);
        ctx.lineTo(c.smoothX + 35, c.smoothY);
        ctx.moveTo(c.smoothX, c.smoothY - 35);
        ctx.lineTo(c.smoothX, c.smoothY + 35);
        ctx.stroke();
      }

      animationFrameId.current = requestAnimationFrame(animate);
    },
    [isActive],
  );

  // --- CORE LIFECYCLE (STRICT MODE SAFE) ---
  useEffect(() => {
    // 1. Setup Resize & Animation Loop
    const observer = new ResizeObserver(() => initGrid());
    if (containerRef.current) observer.observe(containerRef.current);
    animationFrameId.current = requestAnimationFrame(animate);

    // 2. Cancellation Flag for Async Operations
    let ignore = false;
    let localStream = null;

    // 3. The Startup Logic
    const initTracking = async () => {
      if (!isActive || !videoRef.current) return;

      setStatus("ESTABLISHING LINK...");

      try {
        // A. Get Stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { ideal: "default" } },
        });

        // CHECK: Did we stop/unmount while waiting?
        if (ignore) {
          // IMPORTANT: Kill this zombie stream immediately
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // B. Attach Stream
        localStream = stream; // Keep track locally for cleanup
        videoRef.current.srcObject = stream;

        await new Promise((r) => {
          if (!videoRef.current) return;
          videoRef.current.onloadedmetadata = r;
        });

        if (!ignore && videoRef.current) {
          await videoRef.current.play();
        }

        setStatus("NEURAL HANDSHAKE...");

        // C. Load AI
        const hands = new Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });

        hands.onResults((results) => {
          // If we are ignored, don't update state
          if (ignore) return;

          if (results.multiHandLandmarks.length > 0) {
            const marks = results.multiHandLandmarks[0];
            const index = marks[8];
            const thumb = marks[4];

            const x = (1.0 - index.x) * dims.current.w;
            const y = index.y * dims.current.h;

            const tx = (1.0 - thumb.x) * dims.current.w;
            const ty = thumb.y * dims.current.h;
            const dist = Math.hypot(x - tx, y - ty);
            const isPinching = dist < 60;

            cursor.current.x = x;
            cursor.current.y = y;
            cursor.current.active = true;
            cursor.current.type = isPinching ? "pinch" : "open";

            // Detect vertical gesture pattern
            detectVerticalGesture(y);

            setStatus(isPinching ? "SINGULARITY DETECTED" : "REPULSION FIELD");
          } else {
            cursor.current.active = false;
            setStatus("SEARCHING...");
          }
        });

        if (!ignore) {
          handsInstance.current = hands;

          // Start Frame Loop
          const processFrame = async () => {
            if (ignore || !handsInstance.current || !videoRef.current) return;

            if (videoRef.current.readyState === 4 && !videoRef.current.paused) {
              try {
                await handsInstance.current.send({ image: videoRef.current });
              } catch (e) {}
            }
            if (!ignore && isActive) requestAnimationFrame(processFrame);
          };
          processFrame();
        } else {
          hands.close();
        }
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setStatus("ERROR: " + err.message);
        }
      }
    };

    // Run Startup
    initTracking();

    // 4. CLEANUP FUNCTION
    return () => {
      ignore = true; // Signal async tasks to abort
      observer.disconnect();
      cancelAnimationFrame(animationFrameId.current);

      // Stop Local Stream (Captured in closure)
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }

      // Stop Ref Stream (Double safety)
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }

      // Cleanup AI
      if (handsInstance.current) {
        const h = handsInstance.current;
        handsInstance.current = null;
        h.close();
      }

      setStatus("SYSTEM IDLE");
      cursor.current.active = false;
    };
  }, [isActive, initGrid, animate, detectVerticalGesture]);


  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      {/* HUD Info */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          zIndex: 10,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: "12px",
          pointerEvents: "none",
          color: "var(--green-11)",
          letterSpacing: "1px",
          textShadow: "0 0 5px var(--green-8)",
        }}
      >
        STATUS:{" "}
        <span style={{ color: isActive ? "var(--green-9)" : "var(--gray-11)" }}>
          {status}
        </span>
      </div>

      {/* Button */}
      <button
        onClick={() => setIsActive(!isActive)}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          zIndex: 20,
          background: isActive ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.4)",
          border: `1px solid ${isActive ? "var(--green-9)" : "var(--gray-8)"}`,
          color: isActive ? "var(--green-9)" : "var(--gray-10)",
          boxShadow: isActive ? "0 0 10px var(--green-9)" : "none",
          padding: "10px 20px",
          borderRadius: "2px",
          cursor: "pointer",
          fontFamily: "'Courier New', Courier, monospace",
          fontWeight: "bold",
          textTransform: "uppercase",
          letterSpacing: "2px",
          backdropFilter: "blur(4px)",
          transition: "all 0.3s ease",
        }}
      >
        {isActive ? "TERMINATE" : "INITIALIZE"}
      </button>

      {/* GIF Portals - Multiple can appear */}
      {videoPortals.map((portalId, index) => {
        // Offset each portal slightly so they're visible when stacked
        const offsetX = (index % 3) * 30 - 30;
        const offsetY = Math.floor(index / 3) * 30 - 30;
        
        return (
          <div
            key={portalId}
            style={{
              position: "absolute",
              top: `calc(50% + ${offsetY}px)`,
              left: `calc(50% + ${offsetX}px)`,
              transform: "translate(-50%, -50%)",
              zIndex: 100 + index,
              width: "500px",
              maxWidth: "90%",
              border: "2px solid var(--green-9)",
              boxShadow: "0 0 30px var(--green-9), inset 0 0 20px rgba(0, 255, 102, 0.2)",
              borderRadius: "4px",
              overflow: "hidden",
              animation: "portalOpen 0.3s ease-out",
              background: "rgba(0, 0, 0, 0.9)",
              padding: "10px",
            }}
          >
            <img 
              src={`https://cdn.jsdelivr.net/gh/vivienhenz24/deskulpt-widgets@main/quantum-field-easter/sixseven-six.gif?t=${portalId}`}
              alt="Six Seven"
              onLoad={() => {
                console.log("GIF loaded successfully:", portalId);
              }}
              onError={(e) => {
                console.error("Failed to load local GIF:", e);
              }}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                borderRadius: "2px",
              }}
            />
          </div>
        );
      })}

      <video ref={videoRef} style={{ display: "none" }} playsInline></video>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      
      <style>{`
        @keyframes portalOpen {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default QuantumField;
