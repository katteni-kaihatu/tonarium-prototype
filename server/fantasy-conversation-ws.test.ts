import { readFantasySavedProfiles } from './fantasy-test-saved-profiles.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyGmReply } from '../shared/fantasy-gm.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../shared/fantasy-life.ts';
import { FANTASY_LIBRARY_BOOKS } from '../shared/fantasy-library.ts';
import { fantasyLibraryHoldings } from '../shared/fantasy-town.ts';
import { testServerEnv } from './test-db.ts';

interface Message {
  t: string; requestId?: string; profile?: FantasyProfile; text?: string; source?: string;
  actions?: unknown[]; reply?: FantasyGmReply; error?: string;
}

async function isolated(t: TestContext, location = 'hearth') {
  const prefix = path.join(os.tmpdir(), 'tonarium-conversation-ws-');
  const directory = fs.mkdtempSync(prefix), file = path.join(directory, 'fantasy.json');
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Conversation Test', source: 'human', gender: 'female' }, () => .999).profile;
  profile.character!.gold = 300;
  profile.character!.location = location;
  if (!profile.character!.visited.includes(location)) profile.character!.visited.push(location);
  fs.writeFileSync(file, JSON.stringify({ alice: profile }));
  fs.writeFileSync(path.join(directory, 'fantasy-clock.json'), JSON.stringify({ version: 1, hour: profile.character!.hour, wallTime: Date.now() + 3_600_000 }));
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'Conversation test', sessions: [{ id: 'test-world', name: 'Isolated world', world: 'fantasy' }] }));
  const listener = net.createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--dev'], {
    env: { ...process.env, ...(await testServerEnv(t)), TONARIUM_TEST_HELLO_ID: '1', NODE_ENV: 'test', FANTASY_ACCOUNT_TEST_BYPASS: '1', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions,
      LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', KOKOAAI_APIKEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = ''; child.stdout.on('data', data => { logs += String(data); }); child.stderr.on('data', data => { logs += String(data); });
  const sockets: WebSocket[] = [];
  async function until<T>(read: () => T | undefined, timeout = 8_000): Promise<T> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = read(); if (value !== undefined) return value;
      if (child.exitCode !== null) throw new Error(`Test server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw new Error(`Isolated conversation test timed out: ${logs}`);
  }
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    child.kill();
    if (child.exitCode === null && !child.signalCode) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3_000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    if (!path.resolve(directory).startsWith(path.resolve(prefix))) throw new Error('Unexpected test directory');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await until(() => logs.includes('server on') ? true : undefined, 20_000);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(socket);
  const messages: Message[] = []; socket.on('message', raw => messages.push(JSON.parse(String(raw)) as Message));
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  send({ t: 'hello', compat: COMPAT_VERSION, id: 'alice', name: 'Conversation Test' });
  await until(() => messages.find(message => message.t === 'fantasyProfile'));
  send({ t: 'join', sid: 'test-world' });
  send({ t: 'fantasyAction', revision: profile.revision, action: { type: 'sync' } });
  await until(() => messages.find(message => message.t === 'fantasyProfile' && message.profile?.character && !message.error));
  const read = () => readFantasySavedProfiles(file).alice;
  const request = async (message: { requestId: string; t: 'npcChat' | 'fantasyGmChat'; text: string; locale: 'ko' | 'en' | 'ja'; npcId?: string }) => {
    const start = messages.length; send(message);
    return until(() => messages.slice(start).find(reply => reply.requestId === message.requestId));
  };
  return { messages, request, read, until, profile, send };
}

test('innkeeper questions use the actual rooms and meals without AI or changing the visitor', { timeout: 20_000 }, async t => {
  const { request, read } = await isolated(t), before = read();
  const questions = [
    ['ko', '객실 종류를 알려주세요'], ['en', 'What rooms are available here?'], ['ja', '客室の種類を教えてください'],
  ] as const;
  for (const [locale, text] of questions) {
    const reply = await request({ t: 'npcChat', npcId: 'rin', requestId: `rooms-${locale}`, text, locale });
    assert.equal(reply.source, 'canon'); assert.equal(reply.error, undefined);
    for (const room of FANTASY_LODGINGS) assert.ok(reply.text?.includes(room.name[locale]), `${locale}: ${room.name[locale]}`);
    assert.doesNotMatch(reply.text ?? '', /트리플|펜션|world bible|official record|공식.*기록|설정집|サーバー|設定集/i);
  }
  const corrected = await request({ t: 'npcChat', npcId: 'rin', requestId: 'invented-room', text: '특별 할인 객실은 뭔가요?', locale: 'ko' });
  assert.equal(corrected.source, 'canon'); assert.match(corrected.text ?? '', /없|아니|잘못/);
  assert.doesNotMatch(corrected.text ?? '', /공식|설정집|서버|AI|게임|플레이어|버튼/);
  const meal = await request({ t: 'npcChat', npcId: 'rin', requestId: 'inn-meals', text: '어떤 식사를 주문할 수 있어?', locale: 'ko' });
  assert.equal(meal.source, 'canon'); for (const food of FANTASY_DINING) assert.ok(meal.text?.includes(food.name.ko));
  const after = read(); assert.equal(after.revision, before.revision); assert.equal(after.character!.gold, before.character!.gold); assert.deepEqual(after.character!.inventory, before.character!.inventory); assert.equal(after.activity, undefined);
});

test('NPC price negotiation uses text confirmation, commits the actual roll, and duplicate yes cannot reroll', { timeout: 20_000 }, async t => {
  const { request, read, until, profile } = await isolated(t);
  const before = read();
  const proposal = await request({ t: 'npcChat', npcId: 'rin', requestId: 'bargain-proposal', text: '객실값 깎아줘', locale: 'ko' });
  assert.equal(proposal.source, 'canon'); assert.equal(proposal.error, undefined);
  assert.deepEqual(proposal.actions ?? [], []); assert.match(proposal.text ?? '', /객실값/);
  assert.match(proposal.text ?? '', /할까요|답해|승인|확인/);
  const unapproved = read();
  assert.equal(unapproved.revision, before.revision); assert.equal(unapproved.character!.gold, 300);
  assert.equal(unapproved.character!.bargains, undefined); assert.equal(unapproved.activity, undefined);
  const confirmed = await request({ t: 'npcChat', npcId: 'rin', requestId: 'bargain-confirm', text: '응', locale: 'ko' });
  assert.equal(confirmed.source, 'canon'); assert.equal(confirmed.error, undefined); assert.deepEqual(confirmed.actions ?? [], []);
  assert.match(confirmed.text ?? '', /깎아|어렵/); assert.doesNotMatch(confirmed.text ?? '', /d100|성공 기준|서버/);
  const committed = await until(() => { const current = read(); return current.character!.bargains?.room ? current : undefined; });
  assert.equal(committed.revision, profile.revision + 1);
  assert.equal(committed.character!.bargains!.room!.location, 'hearth');
  assert.ok(committed.character!.bargains!.room!.discount >= 0 && committed.character!.bargains!.room!.discount <= .2);
  assert.equal(committed.character!.gold, 300); assert.ok(committed.log.some(entry => /d100=\d+.*DC\d+/.test(entry.text)));
  await request({ t: 'npcChat', npcId: 'rin', requestId: 'bargain-duplicate', text: '응', locale: 'ko' });
  const duplicate = read();
  assert.equal(duplicate.revision, committed.revision); assert.deepEqual(duplicate.character!.bargains, committed.character!.bargains);
  assert.equal(duplicate.log.filter(entry => /d100=/.test(entry.text)).length, committed.log.filter(entry => /d100=/.test(entry.text)).length);
});

test('GM profession learning offers no action buttons and starts one timed training only after spoken yes', { timeout: 20_000 }, async t => {
  const { request, read, until, profile } = await isolated(t);
  const proposal = await request({ t: 'fantasyGmChat', requestId: 'job-proposal', text: '도둑이 되고 싶어', locale: 'ko' });
  assert.equal(proposal.source, 'rules'); assert.equal(proposal.error, undefined);
  assert.deepEqual(proposal.reply?.suggestions ?? [], []); assert.match(proposal.reply?.text ?? '', /도둑/);
  assert.match(proposal.reply?.text ?? '', /할까요|답해|승인|확인/);
  const before = read(); assert.equal(before.revision, profile.revision); assert.equal(before.character!.job, 'unassigned'); assert.equal(before.activity, undefined);
  const confirmation = await request({ t: 'fantasyGmChat', requestId: 'job-confirm', text: '응', locale: 'ko' });
  assert.equal(confirmation.error, undefined); assert.deepEqual(confirmation.reply?.suggestions ?? [], []);
  const training = await until(() => { const current = read(); return current.activity?.action.type === 'job' ? current : undefined; });
  assert.equal(training.revision, profile.revision + 1); assert.deepEqual(training.activity!.action, { type: 'job', job: 'thief', via: 'gm' });
  assert.equal(training.activity!.endsAt - training.activity!.startedAt, 1);
  assert.equal(training.character!.job, 'unassigned'); assert.equal(training.character!.gold, 300);
});

test('active work blocks all NPC dialogue before bargaining or AI while GM can describe it but cannot start another action', { timeout: 20_000 }, async t => {
  const { request, read, until, send, messages, profile } = await isolated(t);
  const bargain = await request({ t: 'npcChat', npcId: 'rin', requestId: 'busy-prior-bargain', text: '객실값 깎아줘', locale: 'ko' });
  assert.equal(bargain.error, undefined); assert.match(bargain.text ?? '', /할까요|답해|승인|확인/);
  const profession = await request({ t: 'fantasyGmChat', requestId: 'busy-prior-profession', text: '도둑이 되고 싶어', locale: 'ko' });
  assert.equal(profession.error, undefined); assert.match(profession.reply?.text ?? '', /도둑/);
  send({ t: 'aiSupport', ready: true, epoch: 'busy-dialogue-test', model: 'retired-browser-model' });
  send({ t: 'fantasyAction', revision: profile.revision, action: { type: 'work' } });
  const working = await until(() => { const current = read(); return current.activity?.action.type === 'work' ? current : undefined; });
  assert.equal(working.revision, profile.revision + 1);
  const questions = [
    ['ko', '안녕'], ['en', 'What rooms are available here?'], ['ja', '夕飯の値段を安くして'],
    ['ko', '응'], ['ko', '비가 오는 저녁에는 어떤 옛 추억이 떠올라?'],
  ] as const;
  for (const [index, [locale, text]] of questions.entries()) {
    const response = await request({ t: 'npcChat', npcId: 'rin', requestId: `busy-npc-${index}`, text, locale });
    assert.equal(response.t, 'npcReply'); assert.equal(response.error, 'busy'); assert.equal(response.source, 'canon');
    assert.equal(response.actions, undefined); assert.ok(response.text);
    assert.deepEqual(read(), working);
  }
  const status = await request({ t: 'fantasyGmChat', requestId: 'busy-gm-status', text: '지금 무슨 행동 중이야? 얼마나 남았어?', locale: 'ko' });
  assert.equal(status.error, undefined); assert.equal(status.source, 'rules');
  assert.match(status.reply?.text ?? '', /일|작업/); assert.match(status.reply?.text ?? '', /남|완료/);
  assert.ok(status.reply?.suggestions.every(suggestion => !suggestion.action));
  const oldApproval = await request({ t: 'fantasyGmChat', requestId: 'busy-gm-approval', text: '응', locale: 'ko' });
  assert.equal(oldApproval.source, 'rules'); assert.deepEqual(oldApproval.reply?.suggestions, []);
  const newAction = await request({ t: 'fantasyGmChat', requestId: 'busy-gm-new-action', text: '도둑이 되고 싶어', locale: 'ko' });
  assert.equal(newAction.source, 'rules'); assert.ok(newAction.reply?.suggestions.every(suggestion => !suggestion.action));
  assert.deepEqual(read(), working); assert.equal(read().character!.bargains, undefined);
  assert.equal(messages.some(message => message.t === 'aiSupportJob'), false);
});

for (const scenario of [
  { locale: 'ko', text: '시작하는 마나 를 읽고싶어', approval: '응', confirmation: /준비해 드릴까요/ },
  { locale: 'en', text: 'I want to read Mana Begins with Breath', approval: 'yes', confirmation: /Shall I arrange that for you/ },
  { locale: 'ja', text: '息から始まるマナを読みたい', approval: 'はい', confirmation: /用意しましょうか/ },
] as const) {
  test(`a librarian proposes the real book without AI and starts reading only after ${scenario.locale} approval`, { timeout: 20_000 }, async t => {
    const { request, read, until, messages } = await isolated(t), before = read();
    const book = FANTASY_LIBRARY_BOOKS.find(book => book.id === 'mana-primer')!;
    assert.ok(fantasyLibraryHoldings(before.character!).includes(book.id));
    const proposal = await request({ t: 'npcChat', npcId: 'hearth-mira', requestId: `reading-proposal-${scenario.locale}`, text: scenario.text, locale: scenario.locale });
    assert.equal(proposal.source, 'canon'); assert.equal(proposal.error, undefined);
    assert.ok(proposal.text?.includes(book.title[scenario.locale]), proposal.text ?? 'Missing reading proposal');
    assert.match(proposal.text ?? '', scenario.confirmation); assert.deepEqual(proposal.actions ?? [], []);
    assert.deepEqual(read(), before);
    const confirmation = await request({ t: 'npcChat', npcId: 'hearth-mira', requestId: `reading-confirm-${scenario.locale}`, text: scenario.approval, locale: scenario.locale });
    assert.equal(confirmation.source, 'canon'); assert.equal(confirmation.error, undefined);
    assert.deepEqual(confirmation.actions ?? [], []);
    const reading = await until(() => { const current = read(); return current.activity?.action.type === 'read' ? current : undefined; });
    assert.equal(reading.revision, before.revision + 1);
    assert.deepEqual(reading.activity!.action, { type: 'read', book: book.id });
    assert.equal(reading.activity!.endsAt - reading.activity!.startedAt, 1);
    assert.deepEqual(reading.character!.inventory, before.character!.inventory);
    assert.equal(reading.character!.gold, before.character!.gold);
    assert.deepEqual(reading.character!.readBooks, before.character!.readBooks);
    assert.equal(messages.some(message => message.t === 'aiSupportJob'), false);
    await request({ t: 'npcChat', npcId: 'hearth-mira', requestId: `reading-repeat-${scenario.locale}`, text: scenario.approval, locale: scenario.locale });
    assert.deepEqual(read(), reading);
  });
}

test('a librarian cannot propose unstocked or invented books and another NPC cannot grant reading', { timeout: 20_000 }, async t => {
  const { request, read } = await isolated(t), before = read();
  const held = fantasyLibraryHoldings(before.character!);
  const absent = FANTASY_LIBRARY_BOOKS.find(book => book.id === 'staff-and-footwork')!;
  assert.notEqual(absent.inGame, false); assert.equal(held.includes(absent.id), false);
  for (const [index, text] of [`${absent.title.ko}를 읽고 싶어`, '달빛으로 만드는 유령 과자라는 책을 읽고 싶어'].entries()) {
    const response = await request({ t: 'npcChat', npcId: 'hearth-mira', requestId: `reading-unavailable-${index}`, text, locale: 'ko' });
    assert.equal(response.source, 'canon'); assert.equal(response.error, undefined);
    assert.deepEqual(response.actions ?? [], []); assert.ok(response.text);
    assert.doesNotMatch(response.text ?? '', /진행할까|진행할까요|준비해 드릴까요/);
    assert.deepEqual(read(), before);
  }
  const wrongSpeaker = await request({ t: 'npcChat', npcId: 'rin', requestId: 'reading-wrong-speaker', text: '숨에서 시작하는 마나를 읽고 싶어', locale: 'ko' });
  assert.deepEqual(wrongSpeaker.actions ?? [], []); assert.deepEqual(read(), before);
});

test('a remote librarian cannot propose or approve reading from another settlement', { timeout: 20_000 }, async t => {
  const { request, read } = await isolated(t, 'emberhall'), before = read();
  for (const [index, text] of ['시작하는 마나 를 읽고싶어', '응'].entries()) {
    const response = await request({ t: 'npcChat', npcId: 'hearth-mira', requestId: `reading-remote-${index}`, text, locale: 'ko' });
    assert.equal(response.error, 'invalid'); assert.deepEqual(response.actions ?? [], []);
    assert.deepEqual(read(), before);
  }
});
