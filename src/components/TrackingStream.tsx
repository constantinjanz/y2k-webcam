import type { TechnicalHudSnapshot } from './TechnicalHud';

type TrackingStreamProps = {
  snapshot: TechnicalHudSnapshot;
  cameraActive: boolean;
  modelReady: boolean;
};

export function TrackingStream({ snapshot, cameraActive, modelReady }: TrackingStreamProps) {
  return (
    <aside className="tracking-stream" aria-label="Tracking stream">
      <div className="panel-heading">
        <span>TRACKING STREAM</span>
        <span>{snapshot.sheetState}</span>
      </div>

      <dl className="readout-grid">
        <div>
          <dt>CAMERA</dt>
          <dd>{cameraActive ? 'ACTIVE' : 'IDLE'}</dd>
        </div>
        <div>
          <dt>MODEL</dt>
          <dd>{modelReady ? 'HAND_LANDMARKER' : 'WAITING'}</dd>
        </div>
        <div>
          <dt>HANDS</dt>
          <dd>{snapshot.hands}/2</dd>
        </div>
        <div>
          <dt>ANCHORS</dt>
          <dd>{snapshot.anchors}/10</dd>
        </div>
        <div>
          <dt>SHEET</dt>
          <dd>{snapshot.sheetState}</dd>
        </div>
        <div>
          <dt>CROSS</dt>
          <dd>{snapshot.crossing ? 'DETECTED' : 'CLEAR'}</dd>
        </div>
        <div>
          <dt>MODE</dt>
          <dd>EXTENDED_FINGER_PRISM</dd>
        </div>
        <div>
          <dt>PRESET</dt>
          <dd>{snapshot.preset}</dd>
        </div>
      </dl>

      <div className="finger-lines" aria-label="Active fingers">
        <p>
          <span>LEFT</span>
          <b>{snapshot.leftFingers.length ? snapshot.leftFingers.join(' ') : 'none'}</b>
        </p>
        <p>
          <span>RIGHT</span>
          <b>{snapshot.rightFingers.length ? snapshot.rightFingers.join(' ') : 'none'}</b>
        </p>
        <p>
          <span>SINGLE</span>
          <b>{snapshot.singleFingers.length ? snapshot.singleFingers.join(' ') : 'none'}</b>
        </p>
      </div>

      <div className="terminal-log" aria-label="Tracking log">
        {snapshot.logs.map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
      </div>
    </aside>
  );
}
