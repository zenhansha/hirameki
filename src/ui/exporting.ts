// File export / import / share helpers.
import type { Memo } from '../store/schema';
import { displayTitle } from '../store/schema';
import { buildMidi, midiFileName, safeFileName } from '../io/midi';
import { renderMemo } from '../audio/render';
import { shareUrl } from '../io/share';
import { exportBundle, importAll, parseImport, ImportError } from '../store/repo';
import { toast } from './state';
import { zipSync } from 'fflate';
import { IS_ARTIFACT, SHARE_BASE, claudeUse } from '../platform';

/** Kinds of file the Artifact viewer lets a page save; others travel inside a .zip. */
const ARTIFACT_SAVABLE = ['json', 'txt', 'md', 'csv', 'zip', 'png', 'svg', 'html', 'pdf'];

/** Save a file. Resolves false when the viewer declined (Artifact build) or saving is unavailable. */
export async function downloadBlob(blob: Blob, name: string): Promise<boolean> {
  if (IS_ARTIFACT) {
    const dl = await claudeUse<{ save(r: { filename: string; data: Blob | Uint8Array }): Promise<unknown> }>('downloads');
    if (!dl) { toast('この表示ではファイルを保存できません。Web版（' + (SHARE_BASE || 'GitHub Pages') + '）で試してね', 'error', undefined, 6000); return false; }
    const ext = name.split('.').pop()!.toLowerCase();
    let filename = name;
    let data: Blob | Uint8Array = blob;
    if (!ARTIFACT_SAVABLE.includes(ext)) {
      // .mid / .wav are not on the viewer's list of savable types: hand them over zipped.
      data = zipSync({ [name]: new Uint8Array(await blob.arrayBuffer()) }, { level: 0 });
      filename = name.replace(/\.[^.]+$/, '') + '.zip';
    }
    try {
      await dl.save({ filename, data });
      return true;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') toast('保存をキャンセルしたよ');
      else if (code === 'rate_limited') toast('前の保存の確認が開いたままみたい。閉じてからもう一度どうぞ');
      else toast('ファイルを保存できませんでした', 'error');
      return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

export function exportMidi(m: Memo, withPattern: boolean, loops: number, side: 'A' | 'B' = 'A') {
  const bytes = buildMidi(m, { withPattern, loops, side });
  downloadBlob(new Blob([bytes as BlobPart], { type: 'audio/midi' }), midiFileName(m)).then((ok) => {
    if (ok) toast(IS_ARTIFACT ? 'MIDIファイルをZIPに入れて保存したよ（コード・ベース別トラック）' : 'MIDIファイルを書き出したよ（コード・ベース別トラック）', 'ok');
  });
}

export const wavBusy = { value: false };

export async function exportWav(m: Memo, loops: number, side: 'A' | 'B' = 'A', onDone?: () => void) {
  if (wavBusy.value) return;
  wavBusy.value = true;
  toast('WAVを書き出し中…（エフェクト込みで計算してるよ）', 'info', undefined, 2500);
  try {
    const r = await renderMemo(m, { loops, side });
    const ok = await downloadBlob(new Blob([r.wav], { type: 'audio/wav' }), safeFileName(m.title.trim() || 'hirameki') + '.wav');
    if (ok) toast(`WAVを書き出したよ（${r.seconds.toFixed(1)}秒${IS_ARTIFACT ? '・ZIPに入れて保存' : ''}）`, 'ok');
  } catch (e) {
    console.error(e);
    const msg = (e as Error)?.message;
    toast(msg === 'NO_OFFLINE' ? 'このブラウザはWAV書き出しに対応していません' : 'WAVの書き出しに失敗しました。メモが長すぎる場合はループ回数を減らしてみてね', 'error', undefined, 6000);
  } finally {
    wavBusy.value = false;
    onDone?.();
  }
}

export async function exportJson(memos: Memo[], name?: string) {
  const b = await exportBundle(memos, true);
  const fname = name ?? (memos.length === 1 ? safeFileName(displayTitle(memos[0])) : `hirameki_${memos.length}memos_${new Date().toISOString().slice(0, 10)}`);
  if (await downloadBlob(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }), fname + '.json')) toast(`${memos.length}件のメモをJSONで書き出したよ`, 'ok');
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = () => res(inp.files?.[0] ?? null);
    inp.click();
  });
}

export async function importJsonFile(): Promise<number> {
  const f = await pickFile('application/json,.json');
  if (!f) return 0;
  try {
    const text = await f.text();
    const data = parseImport(text);
    const n = await importAll(data);
    toast(`${n}件のメモを読み込んだよ${data.patches.length ? `（音色${data.patches.length}件も）` : ''}`, 'ok');
    return n;
  } catch (e) {
    toast(e instanceof ImportError ? e.message : 'ファイルを読み込めませんでした', 'error', undefined, 6000);
    return 0;
  }
}

export async function shareMemo(m: Memo): Promise<'shared' | 'copied' | 'shown'> {
  const url = shareUrl(m);
  const title = displayTitle(m);
  if (!IS_ARTIFACT && navigator.share && /Android|iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try {
      await navigator.share({ title: `HIRAMEKI: ${title}`, text: `コード進行メモ「${title}」`, url });
      return 'shared';
    } catch { /* cancelled → fall through to copy */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('共有リンクをコピーしたよ。別の端末で開くとそのまま復元されるよ', 'ok', undefined, 4500);
    return 'copied';
  } catch {
    return 'shown';
  }
}
