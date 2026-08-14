import React from 'react';
import { WebView } from 'react-native-webview';
import { View } from 'react-native';

function leafletHtml(lat: number, lng: number, interactive: boolean) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>html,body,#map{height:100%;margin:0;padding:0}</style></head>
  <body><div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var lat=${lat}, lng=${lng};
    var map=L.map('map',{zoomControl:true}).setView([lat,lng],15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    var marker=L.marker([lat,lng],{draggable:${interactive ? 'true' : 'false'}}).addTo(map);
    function post(o){ try{ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
    ${interactive ? `
    marker.on('dragend',function(){var p=marker.getLatLng();post({lat:p.lat,lng:p.lng});});
    map.on('click',function(e){marker.setLatLng(e.latlng);post({lat:e.latlng.lat,lng:e.latlng.lng});});
    ` : ''}
  </script></body></html>`;
}

export default function MapView({
  lat, lng, height = 200, interactive = false, onPick,
}: { lat: number; lng: number; height?: number; interactive?: boolean; onPick?: (lat: number, lng: number) => void }) {
  const html = leafletHtml(lat, lng, interactive);
  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: '#E8ECEB' }}
        scrollEnabled={false}
        onMessage={(e: any) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d.lat && d.lng && onPick) onPick(d.lat, d.lng);
          } catch { /* noop */ }
        }}
      />
    </View>
  );
}
