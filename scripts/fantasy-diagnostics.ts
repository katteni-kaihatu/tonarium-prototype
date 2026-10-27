import path from 'node:path';
import fs from 'node:fs/promises';
import { readDiagnosticConversations, summarizeDiagnostics } from '../server/fantasy-diagnostics.ts';
import type { FantasyDiagnosticConversation } from '../server/fantasy-diagnostics.ts';

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('--') ? args.shift()! : 'report';
if (!['report', 'conversations'].includes(command)) throw new Error('Use report or conversations');
const values = new Map<string, string>();
while (args.length) {
  const option = args.shift()!;
  if (!['--data-dir', '--directory', '--from', '--to', '--npc', '--locale', '--actor', '--limit', '--format', '--output'].includes(option) || values.has(option)) throw new Error('Unknown or duplicate option');
  const value = args.shift();
  if (!value || value.startsWith('--')) throw new Error(`Missing ${option} value`);
  values.set(option, value);
}
if (Number(values.has('--directory')) + Number(values.has('--data-dir')) !== 1) throw new Error('One explicit absolute --data-dir or --directory is required');
const requested = values.get('--directory') ?? values.get('--data-dir')!;
if (!path.isAbsolute(requested)) throw new Error('An absolute directory is required');
const directory = values.has('--directory') ? requested : path.join(requested, 'fantasy-diagnostics');
if (command === 'report') {
  if (values.size !== 1) throw new Error('report accepts only --data-dir or --directory');
  console.log(JSON.stringify(await summarizeDiagnostics({ directory }), null, 2));
} else {
  const locale = values.get('--locale');
  if (locale !== undefined && locale !== 'ko' && locale !== 'en' && locale !== 'ja') throw new Error('Use --locale ko, en or ja');
  const requestedLimit = values.get('--limit'), limit = requestedLimit === undefined ? 100 : Number(requestedLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('--limit must be 1 through 1000');
  const format = values.get('--format') ?? 'text';
  if (!['text', 'html', 'json'].includes(format)) throw new Error('Use --format text, html or json');
  const output = values.get('--output');
  if (output !== undefined && !path.isAbsolute(output)) throw new Error('--output must be an absolute new file path');
  const result = await readDiagnosticConversations({ directory, from: values.get('--from'), to: values.get('--to'), npc: values.get('--npc'), locale, actor: values.get('--actor'), limit });
  const escape = (text: string) => text.replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  const heading = (row: FantasyDiagnosticConversation) => [row.startedAt && row.startedAt !== row.at ? `${row.startedAt} → ${row.at}` : row.at, row.npcId ?? row.type, row.locale, row.status, row.reason ?? row.errorCode, row.durationMs === undefined ? undefined : `${row.durationMs}ms`, row.actor].filter(Boolean).join(' | ');
  const summary = `Showing ${result.conversations.length} of ${result.matched} matching conversations${result.limited ? ' (limited)' : ''}. Ignored lines: ${result.ignoredLines}; partial lines: ${result.ignoredPartialLines}; unreadable files: ${result.unreadableFiles}.`;
  let rendered: string;
  if (format === 'json') rendered = JSON.stringify(result, null, 2);
  else if (format === 'text') rendered = [summary, ...result.conversations.map(row => [heading(row), row.query === undefined ? undefined : `Player${row.queryTruncated ? ' [truncated]' : ''}: ${row.query}`, row.reply === undefined ? undefined : `Reply${row.replyTruncated ? ' [truncated]' : ''}: ${row.reply}`].filter(value => value !== undefined).join('\n'))].join('\n\n');
  else rendered = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>RPG conversations</title><style>body{max-width:900px;margin:32px auto;padding:0 20px;font:16px/1.6 system-ui;color:#222;background:#f5f5f2}article{background:white;border:1px solid #ddd;padding:20px;margin:20px 0;border-radius:8px}h2{font-size:14px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}small{color:#666}</style></head><body><h1>RPG conversations</h1><p>' + escape(summary) + '</p>' + result.conversations.map(row => '<article><h2>' + escape(heading(row)) + '</h2>' + (row.query === undefined ? '' : '<h3>Player' + (row.queryTruncated ? ' <small>[truncated]</small>' : '') + '</h3><pre>' + escape(row.query) + '</pre>') + (row.reply === undefined ? '' : '<h3>Reply' + (row.replyTruncated ? ' <small>[truncated]</small>' : '') + '</h3><pre>' + escape(row.reply) + '</pre>') + '</article>').join('') + '</body></html>';
  if (output) {
    await fs.writeFile(output, rendered + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ output: path.resolve(output), conversations: result.conversations.length, matched: result.matched, limited: result.limited }));
  } else console.log(rendered);
}
