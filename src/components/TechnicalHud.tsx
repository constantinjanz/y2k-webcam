import type { SheetState } from '../vision/prismEngine';
import type { ShapeMode } from '../effects/shapeModes';
import { TrackingStream } from './TrackingStream';

export type TechnicalHudSnapshot = {
  hands: number;
  anchors: number;
  sheetState: SheetState;
  crossing: boolean;
  fps: number;
  preset: string;
  shapeMode: ShapeMode;
  overlapEffect: string;
  faceEffects: string[];
  leftFingers: string[];
  rightFingers: string[];
  singleFingers: string[];
  logs: string[];
};

type TechnicalHudProps = {
  snapshot: TechnicalHudSnapshot;
  cameraActive: boolean;
  modelReady: boolean;
  isRecording: boolean;
};

export function TechnicalHud({ snapshot, cameraActive, modelReady, isRecording }: TechnicalHudProps) {
  return (
    <>
      <div className="os-window technical-hud" aria-label="Technical camera status">
        <div className="os-titlebar">
          <span>System Monitor</span>
          <div className="os-titlebar-buttons" aria-hidden="true">
            <span>_</span>
            <span>×</span>
          </div>
        </div>
        <div className="monitor-strip">
          <span className={cameraActive ? 'status-dot active' : 'status-dot'} />
          <span>CAMERA:{cameraActive ? 'ACTIVE' : 'IDLE'}</span>
          <span>MODEL:{modelReady ? 'HAND_LANDMARKER' : 'STANDBY'}</span>
          <span>MODE:{snapshot.shapeMode === '3d' ? '3D' : '2D'}</span>
          <span>FPS:{Math.round(snapshot.fps)}</span>
          <span>REC:{isRecording ? 'ON' : 'OFF'}</span>
        </div>
      </div>
      <TrackingStream snapshot={snapshot} cameraActive={cameraActive} modelReady={modelReady} />
    </>
  );
}
