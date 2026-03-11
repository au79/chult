import { t } from '../i18n';

type DMControlsProps = {
  menuOpen: boolean;
  resetModalOpen: boolean;
  hexOpacityPercent: number;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRequestReset: () => void;
  onRequestFitToWindow: () => void;
  onRequestFitToWidth: () => void;
  onCancelReset: () => void;
  onConfirmReset: () => void;
  onHexOpacityPercentChange: (nextPercent: number) => void;
};

export function DMControls({
  menuOpen,
  resetModalOpen,
  hexOpacityPercent,
  onToggleMenu,
  onCloseMenu,
  onRequestReset,
  onRequestFitToWindow,
  onRequestFitToWidth,
  onCancelReset,
  onConfirmReset,
  onHexOpacityPercentChange,
}: DMControlsProps) {
  return (
    <>
      <div className={`dm-menu-shell${menuOpen ? ' open' : ''}`}>
        <div
          className="dm-menu"
          role="menu"
          aria-label={t('dmControls.menuAriaLabel')}
        >
          <button
            className="button menu-item"
            role="menuitem"
            onClick={onRequestReset}
          >
            {t('dmControls.resetMapHexes')}
          </button>
          <button
            className="button menu-item"
            role="menuitem"
            onClick={onRequestFitToWindow}
          >
            {t('dmControls.fitMapToScreen')}
          </button>
          <button
            className="button menu-item"
            role="menuitem"
            onClick={onRequestFitToWidth}
          >
            {t('dmControls.fitMapToWidth')}
          </button>
          <label className="menu-item opacity-control" htmlFor="hex-opacity">
            <span>
              {t('dmControls.hexOpacityLabel')}{' '}
              <span>{hexOpacityPercent}%</span>
            </span>
            <input
              id="hex-opacity"
              type="range"
              min="10"
              max="100"
              value={hexOpacityPercent}
              onChange={(event) => {
                onHexOpacityPercentChange(Number(event.currentTarget.value));
              }}
            />
          </label>
        </div>
        <button
          className={`button menu-toggle${menuOpen ? ' open' : ''}`}
          aria-label={
            menuOpen
              ? t('dmControls.closeMenuAriaLabel')
              : t('dmControls.openMenuAriaLabel')
          }
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <span className="menu-toggle-icon" aria-hidden="true">
            <span className="menu-toggle-line"></span>
            <span className="menu-toggle-line"></span>
            <span className="menu-toggle-line"></span>
          </span>
        </button>
      </div>
      {menuOpen ? (
        <div className="dm-menu-dismiss" onClick={onCloseMenu}></div>
      ) : null}
      <div
        className={`modal-overlay${resetModalOpen ? ' open' : ''}`}
        aria-hidden={resetModalOpen ? 'false' : 'true'}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onCancelReset();
          }
        }}
      >
        <div
          className="modal-content"
          role="dialog"
          aria-modal="true"
          aria-label={t('dmControls.confirmResetAriaLabel')}
        >
          <p>{t('dmControls.confirmResetPrompt')}</p>
          <div className="modal-actions">
            <button
              className="button modal-button danger"
              onClick={onConfirmReset}
            >
              {t('dmControls.resetMapHexes')}
            </button>
            <button className="button modal-button" onClick={onCancelReset}>
              {t('dmControls.cancel')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
