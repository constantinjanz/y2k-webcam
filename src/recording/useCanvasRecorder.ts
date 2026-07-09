import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

const MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function useCanvasRecorder(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');

  const isSupported = useMemo(() => {
    return typeof window !== 'undefined' && 'MediaRecorder' in window && 'captureStream' in HTMLCanvasElement.prototype;
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas || !isSupported) {
      setError('Recording is not supported in this browser.');
      return;
    }

    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      setError('Recording failed. Try a shorter clip or another browser.');
      setIsRecording(false);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `prismcam-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      link.style.display = 'none';
      document.body.append(link);
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        link.remove();
      }, 1000);
      stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
    };

    recorderRef.current = recorder;
    recorder.start(250);
    setError('');
    setIsRecording(true);
  }, [canvasRef, isSupported]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    isSupported,
    error,
    startRecording,
    stopRecording,
  };
}
