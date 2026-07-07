import type { TechnicalHudSnapshot } from './TechnicalHud';

type TrackingStreamProps = {
  snapshot: TechnicalHudSnapshot;
  cameraActive: boolean;
  modelReady: boolean;
};

export function TrackingStream({ snapshot, cameraActive, modelReady }: TrackingStreamProps) {
  return (
    <aside className="os-window tracking-stream" aria-label="Tracking stream">
      <div className="os-titlebar">
        <span>Tracking Stream</span>
        <div className="os-titlebar-buttons" aria-hidden="true">
          <span>_</span>
          <span>×</span>
        </div>
      </div>

      <div className="tracking-body">
        <dl className="readout-grid">
          <div>
            <dt>camera</dt>
            <dd>{cameraActive ? 'active' : 'idle'}</dd>
          </div>
          <div>
            <dt>model</dt>
            <dd>{modelReady ? 'hand_landmarker' : 'waiting'}</dd>
          </div>
          <div>
            <dt>hands</dt>
            <dd>{snapshot.hands}/2</dd>
          </div>
          <div>
            <dt>anchors</dt>
            <dd>{snapshot.anchors}/10</dd>
          </div>
          <div>
            <dt>sheet</dt>
            <dd>{snapshot.sheetState.toLowerCase()}</dd>
          </div>
          <div>
            <dt>shape</dt>
            <dd>{snapshot.shapeMode === '3d' ? 'faceted_3d' : 'sheet_2d'}</dd>
          </div>
          <div>
            <dt>cross</dt>
            <dd>{snapshot.crossing ? 'detected' : 'clear'}</dd>
          </div>
          <div>
            <dt>preset</dt>
            <dd>{snapshot.preset.toLowerCase().replaceAll(' ', '_')}</dd>
          </div>
          <div>
            <dt>overlap</dt>
            <dd>{snapshot.overlapEffect.toLowerCase().replaceAll(' ', '_')}</dd>
          </div>
          <div>
            <dt>fps</dt>
            <dd>{Math.round(snapshot.fps)}</dd>
          </div>
        </dl>

        <div className="finger-lines" aria-label="Active fingers">
          <p>
            <span>left</span>
            <b>{snapshot.leftFingers.length ? snapshot.leftFingers.join(' ').toLowerCase() : 'none'}</b>
          </p>
          <p>
            <span>right</span>
            <b>{snapshot.rightFingers.length ? snapshot.rightFingers.join(' ').toLowerCase() : 'none'}</b>
          </p>
          <p>
            <span>single</span>
            <b>{snapshot.singleFingers.length ? snapshot.singleFingers.join(' ').toLowerCase() : 'none'}</b>
          </p>
        </div>

        <div className="terminal-log" aria-label="Tracking log">
          {snapshot.logs.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      </div>
    </aside>
  );
}
