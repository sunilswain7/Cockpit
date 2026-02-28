'use client';

import { useState, useEffect } from 'react';
import TrackMap from '@/app/components/TrackMap';
import TelemetryPanel from '@/app/components/TelemetryPanel';

export default function Home() {
  const [year, setYear] = useState('2023');
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [raceTimeMs, setRaceTimeMs] = useState(0); 
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/sessions/${year}`);
        const json = await res.json();
        if (json.success) {
          setSessions(json.data);
          if (json.data.length > 0) setSelectedSession(json.data[0].session_key);
        }
      } catch (error) {
        console.error("Error fetching sessions:", error);
      }
    };
    fetchSessions();
  }, [year]);

  useEffect(() => {
    if (!selectedSession) return;
    const fetchDrivers = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/drivers/${selectedSession}`);
        const json = await res.json();
        if (json.success) {
          setDrivers(json.data);
          setRaceTimeMs(0);
          setIsPlaying(false);
        }
      } catch (error) {
        console.error("Error fetching drivers:", error);
      }
    };
    fetchDrivers();
  }, [selectedSession]);

  // Master Clock: Ticks at 5x real-world speed!
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setRaceTimeMs((prev) => prev + 250); // 50ms interval * 5 = 250ms (5x speed)
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const activeSession = sessions.find((s: any) => s.session_key === selectedSession);

  return (
    <main className="min-h-screen p-8 font-sans selection:bg-emerald-500 selection:text-black">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">F1 Telemetry <span className="text-emerald-500">Cockpit</span></h1>
            <p className="text-neutral-400 mt-1">Synchronized Race Replay Interface</p>
          </div>
          
          <div className="flex items-center gap-4">
            <select 
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-white text-sm rounded-lg p-2.5"
            >
              <option value="2023">2023 Season</option>
              <option value="2024">2024 Season</option>
            </select>

            <select
              value={selectedSession || ''}
              onChange={(e) => setSelectedSession(Number(e.target.value))}
              className="bg-neutral-900 border border-neutral-700 text-white text-sm rounded-lg p-2.5 min-w-[200px]"
            >
              {sessions.map((session: any) => (
                <option key={session.session_key} value={session.session_key}>
                  {session.country_name} - {session.location}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-red-500 animate-pulse' : 'bg-neutral-600'}`}></div>
                Live Track Map
              </h2>
              
              <div className="flex items-center gap-4 w-1/2">
                <span className="font-mono text-sm text-neutral-400 whitespace-nowrap">
                  {Math.floor(raceTimeMs / 60000)}:{(Math.floor((raceTimeMs % 60000) / 1000)).toString().padStart(2, '0')}
                </span>
                {/* The Timeline Scrubber */}
                <input 
                  type="range" 
                  min="0" 
                  max={15 * 60 * 1000} // First 15 mins for now
                  value={raceTimeMs}
                  onChange={(e) => setRaceTimeMs(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded text-sm font-semibold transition-colors"
                >
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
              </div>
            </div>
            
            {activeSession ? (
              <TrackMap 
                session={activeSession} 
                drivers={drivers} 
                raceTimeMs={raceTimeMs} 
              />
            ) : (
              <div className="w-full aspect-video bg-neutral-900 rounded-xl flex items-center justify-center border border-neutral-800">
                Loading Calendar...
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-6">
  
              {/* Live Telemetry Panel */}
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Cockpit Telemetry</h2>
                <TelemetryPanel session={activeSession} driver={selectedDriver} raceTimeMs={raceTimeMs} />
              </div>

              {/* Interactive Leaderboard */}
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Grid (Click to Monitor)</h2>
                <div className="bg-neutral-900 rounded-xl border border-neutral-800 h-full max-h-[400px] overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar">
                  {drivers.length === 0 ? (
                    <div className="text-neutral-500 text-sm m-auto p-4">Loading drivers...</div>
                  ) : (
                    drivers.map((d) => (
                      <button 
                        key={d.driver_number} 
                        onClick={() => setSelectedDriver(d)}
                        className={`flex items-center gap-3 p-2 rounded border text-left transition-colors ${
                          selectedDriver?.driver_number === d.driver_number 
                          ? 'bg-neutral-800 border-emerald-500' 
                          : 'bg-black/40 border-transparent hover:bg-neutral-800'
                        }`}
                      >
                        <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: d.team_color }}></div>
                        <span className="font-mono font-bold w-6 text-white">{d.driver_number}</span>
                        <span className="font-mono text-neutral-300 w-12">{d.name_acronym}</span>
                        <span className="text-sm text-neutral-500 truncate">{d.full_name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}