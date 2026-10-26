export interface UpdateBridge {
  onPrepare(callback: () => Promise<void>, abort: () => void): () => void;
}
declare global { interface Window { tonariumUpdates?: UpdateBridge } }
export const isElectron = () => !!window.tonariumUpdates;
