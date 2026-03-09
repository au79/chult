import { mapHexPolygonPoints } from '../map/mapHexPolygonPoints';

export function MapViewport() {
  return (
    <div data-pinch-zoom className="pinch-zoom-root">
      <svg
        className="map"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        viewBox="0 0 4476 6000"
      >
        <image
          width="2000"
          height="2681"
          xlinkHref=""
          data-map-image=""
          transform="scale(2.238)"
          overflow="visible"
        />
        {mapHexPolygonPoints.map((points, index) => (
          <polygon key={index} className="st0" points={points} />
        ))}
      </svg>
    </div>
  );
}
