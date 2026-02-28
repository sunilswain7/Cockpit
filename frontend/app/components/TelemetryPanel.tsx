'use client';

import { useEffect, useState } from 'react';

interface TelemetryPanelProps {
  session: any;
  driver: any;
  raceTimeMs: number;
}

export default function TelemetryPanel({ session, driver, raceTimeMs }: TelemetryPanelProps) {
  const [carData, setCarData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState({ speed: 0, throttle: 0, brake: 0, rpm: 0, gear: 0 });

  // Fetch the 15-minute chunk for the selected driver
  useEffect(() => {
    if (!session || !driver) return;
    const fetchCarData = async () => {
      setLoading(true);
      const startTime = new Date(session.date_start);
      const endTime = new Date(startTime.getTime() + 15 * 60 * 1000);
      
      try {
        const res = await fetch(`http://localhost:5000/api/car_data/chunk?session_key=${session.session_key}&driver_number=${driver.driver_number}&start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}`);
        const json = await res.json();
        if (json.success) {
          const parsedData = json.data.map((d: any) => ({
            ...d,
            timestamp: new Date(d.date).getTime()
          }));
          setCarData(parsedData);
        }
      } catch (e) {
        console.error("Failed to fetch car data");
      }
      setLoading(false);
    };
    fetchCarData();
  }, [session, driver]);

  // Sync to the Master Clock
  useEffect(() => {
    if (carData.length === 0) return;
    const currentRealTime = new Date(session.date_start).getTime() + raceTimeMs;
    const idx = carData.findIndex(d => d.timestamp > currentRealTime);

    if (idx > 0) {
      // Get closest data point
      const point = carData[idx - 1];
      setCurrentMetrics({
        speed: point.speed || 0,
        throttle: point.throttle || 0,
        brake: point.brake || 0,
        rpm: point.rpm || 0,
        gear: point.n_gear || 0,
      });
    }
  }, [raceTimeMs, carData, session]);

  if (!driver) {
    return <div className="text-neutral-500 text-sm p-4 text-center">Select a driver from the leaderboard to view telemetry.</div>;
  }

  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <h3 className="font-bold text-lg" style={{ color: driver.team_color }}>
          {driver.full_name} ({driver.driver_number})
        </h3>
        {loading && <span className="text-xs text-emerald-500 animate-pulse">Loading Data...</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Speedometer */}
        <div className="bg-black/50 p-4 rounded-lg flex flex-col items-center justify-center">
          <span className="text-4xl font-mono font-bold text-white">{currentMetrics.speed}</span>
          <span className="text-xs text-neutral-500 uppercase tracking-widest mt-1">KM/H</span>
        </div>

        {/* Gear & RPM */}
        <div className="bg-black/50 p-4 rounded-lg flex flex-col items-center justify-center">
          <span className="text-4xl font-mono font-bold text-emerald-500">G{currentMetrics.gear}</span>
          <span className="text-xs text-neutral-500 font-mono mt-1">{currentMetrics.rpm} RPM</span>
        </div>
      </div>

      {/* Throttle & Brake Bars */}
      <div className="space-y-3 pt-2">
        <div>
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-green-500">THROTTLE</span>
            <span>{currentMetrics.throttle}%</span>
          </div>
          <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all duration-75" style={{ width: `${currentMetrics.throttle}%` }}></div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-red-500">BRAKE</span>
            <span>{currentMetrics.brake}%</span>
          </div>
          <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 transition-all duration-75" style={{ width: `${currentMetrics.brake}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}