'use client';

import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';

export default function GlobeSection() {
  const globeEl = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', updateSize);
    // Initial size
    setTimeout(updateSize, 100);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (globeEl.current) {
      const controls = globeEl.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
        controls.enableZoom = false;
      }
    }
  }, [globeEl.current]);

  const arcsData = [
    { startLat: 40.7128, startLng: -74.006, endLat: 51.5074, endLng: -0.1278, color: '#3B82F6' },
    { startLat: 31.2304, startLng: 121.4737, endLat: 34.0522, endLng: -118.2437, color: '#00F0FF' },
    { startLat: 1.3521, startLng: 103.8198, endLat: 52.52, endLng: 13.405, color: '#3B82F6' },
    { startLat: 22.3193, startLng: 114.1694, endLat: -33.8688, endLng: 151.2093, color: '#00F0FF' }
  ];

  const riskZones = [
    { lat: 25.2048, lng: 55.2708, label: 'Port Congestion', size: 0.15, color: '#EF4444' },
    { lat: 51.5074, lng: -0.1278, label: 'Weather Delay', size: 0.1, color: '#EF4444' },
    { lat: 31.2304, lng: 121.4737, label: 'Capacity Shortage', size: 0.2, color: '#EF4444' }
  ];

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center relative cursor-move">
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundColor="rgba(0,0,0,0)"
        arcsData={arcsData}
        arcStartLat={(d: any) => d.startLat}
        arcStartLng={(d: any) => d.startLng}
        arcEndLat={(d: any) => d.endLat}
        arcEndLng={(d: any) => d.endLng}
        arcColor={(d: any) => d.color}
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={1500}
        pointsData={riskZones}
        pointLat={(d: any) => d.lat}
        pointLng={(d: any) => d.lng}
        pointColor={(d: any) => d.color}
        pointAltitude={0.05}
        pointRadius={(d: any) => d.size}
        pointsMerge={false}
      />
    </div>
  );
}
