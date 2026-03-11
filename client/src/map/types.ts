export type MapRole = 'dm' | 'player';
export type FitMapMode = 'window' | 'width';

export type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

export type FitMapRequest = {
  mode: FitMapMode;
  // Incremented per click so identical mode requests still trigger handling.
  requestId: number;
} | null;

export type MapUiState = {
  role: MapRole;
  viewport: ViewportState;
};
