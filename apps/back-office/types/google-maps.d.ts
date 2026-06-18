/** Minimal Google Maps JS API types for geofence preview. */
declare namespace google.maps {
  class Map {
    constructor(el: HTMLElement, opts?: MapOptions);
    setCenter(latLng: LatLngLiteral | LatLng): void;
    panTo(latLng: LatLngLiteral | LatLng): void;
    fitBounds(bounds: LatLngBounds): void;
    addListener(event: string, handler: (e: MapMouseEvent) => void): MapsEventListener;
  }

  class Circle {
    constructor(opts?: CircleOptions);
    setMap(map: Map | null): void;
    setCenter(center: LatLngLiteral | LatLng): void;
    setRadius(radius: number): void;
    getBounds(): LatLngBounds | undefined;
  }

  class Marker {
    constructor(opts?: MarkerOptions);
    setMap(map: Map | null): void;
    setPosition(latLng: LatLngLiteral | LatLng | null): void;
    getPosition(): LatLng | null | undefined;
    addListener(event: string, handler: () => void): MapsEventListener;
  }

  class LatLngBounds {
    extend(point: LatLngLiteral | LatLng): void;
  }

  interface LatLng {
    lat(): number;
    lng(): number;
  }

  interface LatLngLiteral {
    lat: number;
    lng: number;
  }

  interface MapOptions {
    center?: LatLngLiteral;
    zoom?: number;
    mapTypeControl?: boolean;
    streetViewControl?: boolean;
    fullscreenControl?: boolean;
    gestureHandling?: string;
  }

  interface CircleOptions {
    map?: Map;
    center?: LatLngLiteral;
    radius?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    fillColor?: string;
    fillOpacity?: number;
  }

  interface MarkerOptions {
    map?: Map;
    position?: LatLngLiteral;
    draggable?: boolean;
    icon?: { path: number; scale: number; fillColor: string; fillOpacity: number; strokeColor: string; strokeWeight: number };
  }

  interface MapMouseEvent {
    latLng: LatLng | null;
  }

  interface MapsEventListener {
    remove(): void;
  }

  namespace SymbolPath {
    const CIRCLE: number;
  }
}

declare interface Window {
  google?: { maps: typeof google.maps };
}
