import { useState, useEffect } from 'react';

export interface Flight {
  id: string;
  callsign: string;
  country: string;
  longitude: number;
  latitude: number;
  altitude: number; // meters
  velocity: number; // m/s
  heading: number; // degrees
  onGround: boolean;
  modelType: 'small' | 'large'; // Mock representation for variety
}

export function useFlightData(enabled: boolean) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: number;

    const fetchFlights = async () => {
      if (!enabled) return;
      try {
        setLoading(true);
        const res = await fetch('https://opensky-network.org/api/states/all');
        if (!res.ok) throw new Error('Rate limit or fetch error');
        
        const data = await res.json();
        
        const mappedFlights = data.states
          .filter((state: any[]) => state[5] !== null && state[6] !== null && state[13] !== null)
          .map((state: any[]) => {
            const modelType = state[9] > 150 ? 'large' : 'small'; 
            
            return {
              id: state[0],
              callsign: state[1] ? state[1].trim() : 'Unknown',
              country: state[2],
              longitude: state[5],
              latitude: state[6],
              altitude: state[13] || state[7] || 0,
              velocity: state[9] || 0,
              heading: state[10] || 0,
              onGround: state[8],
              modelType
            };
          });
        
        setFlights(mappedFlights.slice(0, 3000));
        setError(null);
      } catch (err: any) {
        console.warn('OpenSky API failed, using simulated data');
        setError(err.message);
        
        setFlights(prev => {
          if (prev.length === 0) {
            return Array.from({length: 800}).map((_, i) => ({
              id: `mock-${i}`,
              callsign: `SM${i}`,
              country: 'Simulation',
              longitude: (Math.random() - 0.5) * 360,
              latitude: (Math.random() - 0.5) * 160,
              altitude: 9000 + Math.random() * 3000,
              velocity: 250,
              heading: Math.random() * 360,
              onGround: false,
              modelType: Math.random() > 0.5 ? 'large' : 'small' as any
            }));
          }
          return prev.map(f => {
            const rad = ((90 - f.heading) * Math.PI) / 180;
            return {
              ...f,
              longitude: f.longitude + (f.velocity / 1000000) * Math.cos(rad),
              latitude: f.latitude + (f.velocity / 1000000) * Math.sin(rad),
            }
          });
        });
      } finally {
        setLoading(false);
      }
    };

    if (enabled) {
      fetchFlights();
      // Fetch every 15 seconds to avoid OpenSky aggressive rate limiting
      interval = window.setInterval(fetchFlights, 15000);
    } else {
      setFlights([]);
    }

    return () => clearInterval(interval);
  }, [enabled]);

  return { flights, loading, error };
}
