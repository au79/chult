export function DMControls() {
  return (
    <>
      <div id="dm-menu-shell" className="dm-menu-shell">
        <div
          id="dm-menu"
          className="dm-menu"
          role="menu"
          aria-label="Dungeon master controls"
        >
          <button
            id="reset"
            className="button menu-item reset-action"
            role="menuitem"
          >
            Reset map hexes
          </button>
          <label className="menu-item opacity-control" htmlFor="hex-opacity">
            <span>
              Hex opacity <span id="hex-opacity-value">65%</span>
            </span>
            <input
              id="hex-opacity"
              type="range"
              min="10"
              max="100"
              defaultValue="65"
            />
          </label>
        </div>
        <button
          id="menu-toggle"
          className="button menu-toggle"
          aria-label="Open DM controls"
          aria-expanded="false"
        >
          <span className="menu-toggle-icon" aria-hidden="true">
            <span className="menu-toggle-line"></span>
            <span className="menu-toggle-line"></span>
            <span className="menu-toggle-line"></span>
          </span>
        </button>
      </div>
      <div
        id="reset-confirm-modal"
        className="modal-overlay"
        aria-hidden="true"
      >
        <div
          className="modal-content"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm reset"
        >
          <p>Reset all currently revealed hexes?</p>
          <div className="modal-actions">
            <button id="reset-confirm" className="button modal-button danger">
              Reset map hexes
            </button>
            <button id="reset-cancel" className="button modal-button">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
