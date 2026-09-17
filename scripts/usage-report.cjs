#!/usr/bin/env node
const os = require('node:os');
const path = require('node:path');
const { readUsage, summarizeUsage } = require('../electron/usage-service.cjs');

function defaultDirectory() {
  const base =
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.platform === 'win32'
        ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
        : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'pydicate-studio', 'usage');
}

function formatReport(report) {
  const lines = [
    `Pydicate Studio · uso nos últimos ${report.period.days} dias`,
    `${report.totalEvents} eventos · ${report.sessions.length} sessões · ${report.storage.files} arquivos · ${report.storage.unreadableLines} linhas ilegíveis preservadas`,
    '',
    'Ações:',
    ...report.actions.map((row) => `  ${row.count}\t${row.event}`),
    '',
    'Erros:',
    ...(report.errors.length
      ? report.errors.map(
          (row) =>
            `  ${row.count}\t${row.event} / ${row.errorCode}${row.phase ? ` / ${row.phase}` : ''}${row.example ? ` — ${row.example}` : ''}`,
        )
      : ['  Nenhum erro registrado no período.']),
    '',
    'Durações (mediana / p95 / máximo; ms):',
    ...report.latencies.map(
      (row) =>
        `  ${row.event} (${row.outcome}, n=${row.count})\t${row.medianMs} / ${row.p95Ms} / ${row.maximumMs}`,
    ),
    '',
    'Solicitações recentes (última fase / resultado observado):',
    ...report.requests
      .slice(-10)
      .map(
        (row) =>
          `  ${row.requestId}\t${row.phases.at(-1) || 'sem fase'} / ${row.outcome}${row.lastMeasuredDurationMs === undefined ? '' : ` / ${row.lastMeasuredDurationMs} ms`}`,
      ),
    '',
    'Sequências de interface mais frequentes:',
    ...report.transitions.slice(0, 12).map((row) => `  ${row.count}\t${row.sequence}`),
    '',
    'Ações consecutivas repetidas em até 30 s:',
    ...report.repeatedActionsWithin30Seconds.map((row) => `  ${row.count}\t${row.event}`),
    `Retornos de passagem A → B → A em até 2 min: ${report.passageBacktracksWithin2Minutes.length}`,
    '',
    report.interpretation,
  ];
  return `${lines.join('\n')}\n`;
}

async function main(args = process.argv.slice(2)) {
  const options = { directory: defaultDirectory(), days: 7, json: false, export: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--directory') options.directory = path.resolve(args[++index] || '');
    else if (argument === '--days') options.days = Number(args[++index]);
    else if (argument === '--json') options.json = true;
    else if (argument === '--export') options.export = true;
    else if (argument === '--help') {
      process.stdout.write(
        'node scripts/usage-report.cjs [--directory PATH] [--days 7] [--json | --export]\nRead-only local usage summary. --export prints sanitized JSONL; no provider/network requests.\n',
      );
      return;
    } else throw new Error(`Argumento desconhecido: ${argument}`);
  }
  const data = await readUsage(options.directory, { days: options.days });
  if (options.export)
    process.stdout.write(
      data.records.map((record) => JSON.stringify(record)).join('\n') +
        (data.records.length ? '\n' : ''),
    );
  else {
    const report = summarizeUsage(data);
    process.stdout.write(
      options.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report),
    );
  }
}

if (require.main === module)
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
module.exports = { main, formatReport, defaultDirectory };
