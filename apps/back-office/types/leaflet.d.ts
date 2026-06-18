/** Minimal Leaflet types for geofence map fallback. */
declare namespace L {
  class Map {
    constructor(el: HTMLElement, opts?: MapOptions);
    setView(latlng: LatLngExpression, zoom: number): this;
    fitBounds(bounds: LatLngBoundsExpression): this;
    on(event: string, handler: (e: LeafletMouseEvent) => void): this;
    remove(): void;
  }

  class TileLayer {
    constructor(url: string, opts?: TileLayerOptions);
    addTo(map: Map): this;
  }

  class Circle {
    constructor(latlng: LatLngExpression, opts?: CircleOptions);
    addTo(map: Map): this;
    setLatLng(latlng: LatLngExpression): this;
    setRadius(radius: number): this;
    getBounds(): LatLngBounds;
  }

  class CircleMarker {
    constructor(latlng: LatLngExpression, opts?: CircleMarkerOptions);
    addTo(map: Map): this;
    setLatLng(latlng: LatLngExpression): this;
    on(event: string, handler: (e: LeafletMouseEvent) => void): this;
  }

  class LatLngBounds {
    constructor(corner1: LatLngExpression, corner2: LatLngExpression);
  }

  type LatLngExpression = [number, number] | { lat: number; lng: number };

  type LatLngBoundsExpression = LatLngBounds | LatLngExpression[];

  interface MapOptions {
    zoomControl?: boolean;
  }

  interface TileLayerOptions {
    attribution?: string;
    maxZoom?: number;
  }

  interface CircleOptions {
    radius?: number;
    color?: string;
    fillColor?: string;
    fillOpacity?: number;
    weight?: number;
  }

  interface CircleMarkerOptions {
    radius?: number;
    fillColor?: string;
    color?: string;
    weight?: number;
    fillOpacity?: number;
    draggable?: boolean;
  }

  interface LeafletMouseEvent {
    latlng: { lat: number; lng: number };
  }

  function map(el: HTMLElement, opts?: MapOptions): Map;
  function tileLayer(url: string, opts?: TileLayerOptions): TileLayer;
  function circle(latlng: LatLngExpression, opts?: CircleOptions): Circle;
  function circleMarker(latlng: LatLngExpression, opts?: CircleMarkerOptions): CircleMarker;
}

declare interface Window {
  L?: typeof L;
}
