'use client';

import { useEffect, useRef, useState } from 'react';

interface TrackMapProps {
  session: any;
  drivers: any[];
  raceTimeMs: number;
}

export default function TrackMap({ session, drivers, raceTimeMs }: TrackMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trackCoords, setTrackCoords] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<Record<number, any[]>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const animationRef = useRef<number>(0);

  // 1. Fetch Track
  useEffect(() => {
    if (!session) return;
    const fetchTrack = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/track/${session.session_key}`);
        const { data } = await res.json();
        if (data) setTrackCoords(data);
      } catch (error) {
        console.error("Failed to load track", error);
      }
    };
    fetchTrack();
  }, [session]);

  // 2. Fetch Telemetry Chunks for all Drivers
  useEffect(() => {
    if (!session || drivers.length === 0) return;

    const startTime = new Date(session.date_start);
    const endTime = new Date(startTime.getTime() + 15 * 60 * 1000); // Grab the first 15 minutes

    const fetchTelemetry = async () => {
      setIsDownloading(true);
      const newTelemetry: Record<number, any[]> = {};
      
      // We loop sequentially so OpenF1 doesn't block us for making 20 requests at the exact same millisecond
      for (const driver of drivers) {
        try {
          const res = await fetch(`http://localhost:5000/api/telemetry/chunk?session_key=${session.session_key}&driver_number=${driver.driver_number}&start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}`);
          const json = await res.json();
          if (json.success && json.data.length > 0) {
            // Pre-calculate timestamps so the animation loop doesn't have to parse dates 60 times a second
            newTelemetry[driver.driver_number] = json.data.map((d: any) => ({
              x: d.x,
              y: d.y,
              timestamp: new Date(d.date).getTime()
            }));
          }
        } catch (e) {
          console.error("Error fetching driver", driver.driver_number, e);
        }
      }
      setTelemetry(newTelemetry);
      setIsDownloading(false);
    };

    fetchTelemetry();
  }, [session, drivers]);

  // 3. The Interpolation Render Loop
  useEffect(() => {
    if (trackCoords.length === 0 || !canvasRef.current || Object.keys(telemetry).length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const minX = Math.min(...trackCoords.map(c => c.x));
    const maxX = Math.max(...trackCoords.map(c => c.x));
    const minY = Math.min(...trackCoords.map(c => c.y));
    const maxY = Math.max(...trackCoords.map(c => c.y));

    const padding = 50;
    const scale = Math.min(
      (canvas.width - padding * 2) / (maxX - minX),
      (canvas.height - padding * 2) / (maxY - minY)
    );
    const offsetX = (canvas.width - (maxX - minX) * scale) / 2;
    const offsetY = (canvas.height - (maxY - minY) * scale) / 2;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Track
      ctx.beginPath();
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      trackCoords.forEach((c, i) => {
        const canvasX = (c.x - minX) * scale + offsetX;
        const canvasY = (maxY - c.y) * scale + offsetY; 
        if (i === 0) ctx.moveTo(canvasX, canvasY);
        else ctx.lineTo(canvasX, canvasY);
      });
      ctx.stroke();

      // Calculate absolute world time
      const currentRealTime = new Date(session.date_start).getTime() + raceTimeMs;

      // Draw Cars using Lerp
      drivers.forEach((driver) => {
        const data = telemetry[driver.driver_number];
        if (!data || data.length === 0) return;

        // Find where we are in the telemetry array
        const idx = data.findIndex(d => d.timestamp > currentRealTime);
        let carX, carY;

        if (idx === -1) {
          // Time is past our data, park car at the end
          carX = data[data.length - 1].x;
          carY = data[data.length - 1].y;
        } else if (idx === 0) {
          // Time is before our data starts, park car at the beginning
          carX = data[0].x;
          carY = data[0].y;
        } else {
          // LERP: Smoothly calculate position between Point A and Point B
          const pointA = data[idx - 1];
          const pointB = data[idx];
          
          const timeDiff = pointB.timestamp - pointA.timestamp;
          const timePastA = currentRealTime - pointA.timestamp;
          const progress = timeDiff === 0 ? 0 : timePastA / timeDiff;

          carX = pointA.x + (pointB.x - pointA.x) * progress;
          carY = pointA.y + (pointB.y - pointA.y) * progress;
        }

        const canvasX = (carX - minX) * scale + offsetX;
        const canvasY = (maxY - carY) * scale + offsetY;

        ctx.beginPath();
        ctx.arc(canvasX, canvasY, 6, 0, Math.PI * 2);
        ctx.fillStyle = driver.team_color;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(driver.name_acronym, canvasX, canvasY - 10);
      });

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current!);
  }, [trackCoords, drivers, raceTimeMs, telemetry, session]);

  return (
    <div className="relative w-full max-w-4xl aspect-video bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden shadow-2xl">
      {isDownloading && (
        <div className="absolute top-4 left-4 text-emerald-500 animate-pulse font-mono text-xs z-10 bg-black/50 px-2 py-1 rounded">
          Buffering telemetry cache from SQLite...
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        width={1000} 
        height={600} 
        className="w-full h-full object-contain"
      />
    </div>
  );
}