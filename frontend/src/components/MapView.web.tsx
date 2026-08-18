import React from 'react';
import { View } from 'react-native';

// Web implementation: react-native-webview has no web support, so we render an
// OpenStreetMap embed via a native <iframe> (valid in react-native-web / React DOM).
export default function MapView({
  lat, lng, height = 200,
}: { lat: number; lng: number; height?: number; interactive?: boolean; onPick?: (lat: number, lng: number) => void }) {
  const d = 0.008;
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E8ECEB' }}>
      {/* @ts-ignore - iframe is a valid host element on web */}
      <iframe
        title="clinic-map"
        src={src}
        style={{ border: 0, width: '100%', height: '100%' }}
        loading="lazy"
      />
    </View>
  );
}
