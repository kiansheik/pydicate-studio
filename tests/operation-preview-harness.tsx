import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OperationPreview, type OperationPreviewProps } from '../src/components/OperationPreview';
import type { StudioBridge } from '../src/domain/types';
import '../src/styles.css';
import '../src/theme.css';

declare global {
  interface Window {
    operationPreview: {
      requests: { method: string; params: Record<string, unknown> }[];
      resolve: (index: number, result?: Record<string, unknown>) => void;
      reject: (index: number, message: string) => void;
      update: (props: Partial<OperationPreviewProps>) => void;
      show: (visible: boolean) => void;
    };
  }
}
const pending = new Map<
  number,
  { resolve: (result: unknown) => void; reject: (reason: Error) => void }
>();
window.operationPreview = {
  requests: [],
  resolve(index, result = {}) {
    const request = this.requests[index].params;
    pending.get(index)!.resolve({
      origin: 'engine',
      expression: request.raw,
      revisionId: request.revisionId,
      engineFingerprint: request.engineFingerprint,
      evaluationStatus: 'complete',
      surface: `forma:${request.raw}`,
      ...result,
    });
    pending.delete(index);
  },
  reject(index, message) {
    pending.get(index)!.reject(new Error(message));
    pending.delete(index);
  },
  update() {},
  show() {},
};
window.studio = {
  invoke(method: string, params: Record<string, unknown>) {
    const index = window.operationPreview.requests.push({ method, params }) - 1;
    return new Promise((resolve, reject) => pending.set(index, { resolve, reject }));
  },
} as unknown as StudioBridge;

function Harness() {
  const [props, setProps] = useState<OperationPreviewProps>({
    raw: '',
    passageId: 'passage:test',
    sourceId: 'source:test',
    revisionId: 'revision:1',
    engineFingerprint: 'engine:test',
    contextKey: 'operation:1',
    pendingMessage: 'Escolha a peça que falta.',
  });
  const [visible, setVisible] = useState(true);
  window.operationPreview.update = (next) => setProps((current) => ({ ...current, ...next }));
  window.operationPreview.show = setVisible;
  return (
    <main style={{ padding: 24, maxWidth: 480 }}>{visible && <OperationPreview {...props} />}</main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
