import { useState } from 'react';
import type { AntimatterSlice } from './types.ts';
import { s } from './styles.ts';
import { emitAdFeedback } from '../../ad/feedback.ts';

export function ProfilePanel({ ad, notice }: { ad: AntimatterSlice; notice: (msg: string) => void }) {
  const [newName, setNewName] = useState('');
  const [exportText, setExportText] = useState('');
  const [busy, setBusy] = useState(false);
  const active = ad.activeProfile;

  const download = (text: string, filename: string) => {
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // テキストエリアへの出力だけでも使える
    }
  };

  const onExport = () => {
    try {
      const text = ad.exportBundle();
      setExportText(text);
      download(text, 'antimatter-dimensions-export-v2.json');
      notice('v2 バンドルをエクスポートしました（ユーザー情報＋セーブ）');
    } catch {
      notice('v2 エクスポートに失敗しました');
    }
  };

  const onImport = () => {
    const text = exportText.trim();
    if (!text) {
      emitAdFeedback({ kind: 'error' });
      notice('インポートする JSON をテキストエリアに貼り付けてください');
      return;
    }
    const result = ad.importBundle(text);
    notice(result.message);
  };

  const onReset = () => {
    if (!window.confirm('本当にリセットしますか？すべての進行状況が消え、元に戻せません。')) return;
    if (!window.confirm('最終確認: 本当に最初からやり直しますか？')) return;
    try {
      ad.resetGame();
      setExportText('');
      notice('リセットしました。新しいゲームを開始します');
    } catch {
      notice('リセットできませんでした');
    }
  };

  const onCreate = () => {
    const name = newName.trim();
    if (!name) {
      emitAdFeedback({ kind: 'error' });
      notice('新しいプロフィールの名前を入力してください');
      return;
    }
    try {
      ad.createProfile(name);
      setNewName('');
      notice(`プロフィール「${name}」を作成して切り替えました`);
    } catch {
      notice('プロフィールを作成できませんでした');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h3 style={s.sectionTitle}>プロフィール</h3>
        {active && <p style={s.muted}>現在: {active.name} <span>ID: {active.id}</span>{ad.lastSavedAt ? ` · 最終保存: ${ad.lastSavedAt}` : ''}</p>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select
            style={s.input} value={active?.id ?? ''} aria-label="プロフィール"
            onChange={(e) => {
              if (!e.target.value) return;
              try { ad.switchProfile(e.target.value); }
              catch { notice('プロフィールを切り替えられませんでした'); }
            }}
          >
            {ad.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input style={s.input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新しいプロフィール名" aria-label="新しいプロフィール名" />
          <button style={s.btn} onClick={onCreate}>作成して切り替え</button>
          {active && ad.profiles.length > 1 && (
            <button style={s.btnDanger} onClick={() => { if (window.confirm(`プロフィール「${active.name}」を削除しますか？`)) ad.deleteProfile(active.id); }}>現在のプロフィールを削除</button>
          )}
        </div>
      </div>
      <div>
        <h3 style={s.sectionTitle}>セーブ / サーバー</h3>
        {ad.serverStatus && <p style={s.muted}>{ad.serverStatus}</p>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={s.btn} disabled={busy} onClick={() => { setBusy(true); void ad.saveToServer().finally(() => setBusy(false)); }}>サーバーに保存</button>
          <button style={s.btn} disabled={busy} onClick={() => { if (!window.confirm('サーバーのセーブを読み込みますか？現在のローカル進行は上書きされます。')) return; setBusy(true); void ad.loadFromServer().finally(() => setBusy(false)); }}>サーバーから読込</button>
          <button style={s.btnDanger} onClick={onReset}>最初からリセット</button>
        </div>
      </div>
      <div>
        <h3 style={s.sectionTitle}>エクスポート / インポート（v2 バンドル）</h3>
        <p style={s.muted}>バンドルは現在のプロフィール配下へ取り込まれます。元ユーザーの ID は引き継がれません。</p>
        <textarea style={s.textarea} value={exportText} onChange={(e) => setExportText(e.target.value)} placeholder="ここに v2 バンドル JSON を貼り付けてインポート、またはエクスポート結果が表示されます" aria-label="エクスポート / インポート用 JSON" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <button style={s.btn} onClick={onExport}>エクスポート（v2・ダウンロード付き）</button>
          <button style={s.btn} onClick={onImport}>貼り付けた JSON をインポート</button>
        </div>
      </div>
    </div>
  );
}
