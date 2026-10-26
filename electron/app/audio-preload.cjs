// 接続先には機器操作と状態保存の通知だけを渡し、更新適用の権限は渡さない。
const { contextBridge, ipcRenderer } = require('electron');

function installAudioAdapter(initial) {
  const media = navigator.mediaDevices;
  if (!media || window.__tonariumElectronAudio) return;
  let selection = { input: initial?.input || '', output: initial?.output || '' };
  let notice = '';
  let lastError = '';
  let inputManaged = Boolean(selection.input);
  const labelsSeen = new Set();
  let queue = Promise.resolve();
  const contexts = new Set();
  const elements = new Set();
  const sinkTasks = new Set();
  const nativeGetUserMedia = media.getUserMedia.bind(media);
  const nativeSetSinkId = globalThis.HTMLMediaElement?.prototype.setSinkId;
  const normalized = value => typeof value === 'string' && value !== 'default' ? value : '';
  const errorText = error => error?.message || String(error);
  const trackTask = promise => {
    const task = Promise.resolve(promise).then(() => null, error => { lastError = errorText(error); return error; });
    sinkTasks.add(task);
    task.finally(() => sinkTasks.delete(task));
  };
  media.getUserMedia = constraints => {
    if (!constraints?.audio || (!selection.input && !inputManaged)) return nativeGetUserMedia(constraints);
    const audio = typeof constraints.audio === 'object' ? constraints.audio : {};
    return nativeGetUserMedia({ ...constraints, audio: { ...audio, deviceId: { exact: selection.input || 'default' } } });
  };
  const setElementSink = (element, id) => {
    if (!nativeSetSinkId) {
      if (id) return Promise.reject(new Error('この環境では音声出力先を変更できません。'));
      return Promise.resolve();
    }
    return nativeSetSinkId.call(element, id);
  };
  const routeElement = element => {
    if (elements.has(element)) return;
    elements.add(element);
    if (selection.output) trackTask(setElementSink(element, selection.output));
  };
  if (globalThis.HTMLMediaElement) {
    const prototype = HTMLMediaElement.prototype;
    const play = prototype.play;
    prototype.play = function (...args) {
      routeElement(this);
      // Calling play immediately preserves the browser's user-activation semantics.
      return play.apply(this, args);
    };
  }
  const scan = root => {
    if (root instanceof HTMLMediaElement) routeElement(root);
    root.querySelectorAll?.('audio,video').forEach(routeElement);
  };
  scan(document);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(scan)))
    .observe(document, { childList: true, subtree: true });
  const wrapped = new Map();
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Original = globalThis[name];
    if (!Original) continue;
    if (!wrapped.has(Original)) wrapped.set(Original, new Proxy(Original, {
      construct(target, args, newTarget) {
        // Choose the initial destination before a source can produce audio.
        const options = selection.output ? [{ ...args[0], sinkId: selection.output }, ...args.slice(1)] : args;
        try {
          const context = Reflect.construct(target, options, newTarget);
          contexts.add(context);
          if (selection.output && !context.setSinkId) lastError = 'この環境では Web Audio の出力先を変更できません。';
          return context;
        } catch (error) { lastError = errorText(error); throw error; }
      },
    }));
    globalThis[name] = wrapped.get(Original);
  }
  const routeAll = async output => {
    scan(document);
    const pendingErrors = (await Promise.all([...sinkTasks])).filter(Boolean);
    const tasks = [...elements].map(element => setElementSink(element, output));
    for (const context of contexts) {
      if (context.state === 'closed') { contexts.delete(context); continue; }
      if (context.setSinkId) tasks.push(context.setSinkId(output));
      else if (output) tasks.push(Promise.reject(new Error('この環境では Web Audio の出力先を変更できません。')));
    }
    const results = await Promise.allSettled(tasks);
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    if (pendingErrors.length) throw pendingErrors[0];
  };
  const status = () => ({ ...selection, notice, error: lastError, outputSupported: Boolean(nativeSetSinkId && (!globalThis.AudioContext || globalThis.AudioContext.prototype.setSinkId)) });
  const apply = requested => {
    const operation = queue.then(async () => {
      const next = { input: normalized(requested?.input), output: normalized(requested?.output) };
      const previous = { ...selection };
      const previousInputManaged = inputManaged;
      const room = globalThis.__tonariumRoom;
      const inputChanged = next.input !== previous.input;
      let inputAttempted = false;
      selection = next;
      if (inputChanged) inputManaged = true;
      notice = '';
      lastError = '';
      try {
        if (next.output !== previous.output) await routeAll(next.output);
        if (inputChanged && typeof room?.switchActiveDevice === 'function') {
          inputAttempted = true;
          const result = await room.switchActiveDevice('audioinput', next.input || 'default');
          if (result === false) throw new Error('マイクを切り替えられませんでした。');
        } else if (inputChanged) {
          notice = 'マイクの変更は次の録音・通話開始時に反映されます。';
        }
        return status();
      } catch (error) {
        selection = previous;
        inputManaged = previousInputManaged;
        const failures = [];
        if (next.output !== previous.output) await routeAll(previous.output).catch(e => failures.push(errorText(e)));
        if (inputAttempted) {
          await Promise.resolve().then(() => room.switchActiveDevice('audioinput', previous.input || 'default'))
            .then(result => { if (result === false) throw new Error('マイクの復元に失敗しました。'); })
            .catch(e => failures.push(errorText(e)));
        }
        notice = errorText(error) + (failures.length ? ` 復元: ${failures.join('; ')}` : '');
        lastError = notice;
        throw new Error(notice);
      }
    });
    queue = operation.catch(() => {});
    return operation;
  };
  const list = async () => {
    await queue;
    const devices = await media.enumerateDevices();
    const next = { ...selection };
    for (const [key, kind] of [['input', 'audioinput'], ['output', 'audiooutput']]) {
      const available = devices.filter(d => d.kind === kind && d.deviceId);
      if (available.some(d => d.label)) labelsSeen.add(kind);
      // Once permission revealed labels, an empty list means all devices were removed.
      // Before that point redaction must not discard a saved device choice.
      if (next[key] && labelsSeen.has(kind) && !available.some(d => d.deviceId === next[key])) next[key] = '';
    }
    if (next.input !== selection.input || next.output !== selection.output) {
      await apply(next);
      notice = '選択したデバイスが外れたため、既定のデバイスに戻しました。';
    }
    return {
      ...status(),
      devices: devices.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map(d => ({ deviceId: d.deviceId, kind: d.kind, label: d.label, groupId: d.groupId })),
    };
  };
  media.addEventListener('devicechange', () => { void list().catch(error => { lastError = errorText(error); }); });
  Object.defineProperty(window, '__tonariumElectronAudio', {
    value: Object.freeze({ list, apply, status }), configurable: false, writable: false,
  });
}

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('tonariumUpdates', Object.freeze({
    onPrepare: (callback, abort) => {
      const handler = (_event, id) => Promise.resolve().then(callback)
        .then(() => ipcRenderer.send('shell:prepared-update', id, null), error => ipcRenderer.send('shell:prepared-update', id, error?.message || '状態を保存できませんでした。'));
      ipcRenderer.on('shell:prepare-update', handler);
      const cancelled = () => abort();
      ipcRenderer.on('shell:update-aborted', cancelled);
      return () => {
        ipcRenderer.removeListener('shell:prepare-update', handler);
        ipcRenderer.removeListener('shell:update-aborted', cancelled);
      };
    },
  }));
  const config = ipcRenderer.sendSync('shell:audio-config');
  if (config) contextBridge.executeInMainWorld({ func: installAudioAdapter, args: [config] });
}
