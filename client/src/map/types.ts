export type MapRole = 'dm' | 'player';

export type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

export type MapUiState = {
  role: MapRole;
  viewport: ViewportState;
};
