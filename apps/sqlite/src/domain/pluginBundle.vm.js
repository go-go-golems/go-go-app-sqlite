// @ts-check
defineStackBundle(({ ui }) => {
  function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }

  function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getDomains(globalState) {
    return asRecord(asRecord(globalState).domains);
  }

  function getSqliteDomain(globalState) {
    return asRecord(getDomains(globalState).app_sqlite);
  }

  function getHypercardState(globalState) {
    return asRecord(getSqliteDomain(globalState).hypercard);
  }

  function getQueryResult(globalState) {
    return asRecord(getHypercardState(globalState).lastQueryResult);
  }

  function getQueryError(globalState) {
    return asRecord(getHypercardState(globalState).lastQueryError);
  }

  function getSeedReport(globalState) {
    return asRecord(getHypercardState(globalState).lastSeedReport);
  }

  function getStatus(globalState) {
    return asRecord(getHypercardState(globalState).status);
  }

  function parseParams(text) {
    const trimmed = asString(text).trim();
    if (!trimmed) return {};

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return { positionalParams: parsed };
      }
      if (parsed && typeof parsed === 'object') {
        return { namedParams: parsed };
      }
      return {};
    } catch {
      return {};
    }
  }

  function buildRowsFromResult(result) {
    const columns = asArray(result.columns).map((column) => asString(asRecord(column).name));
    const rows = asArray(result.rows).map((row) =>
      columns.map((column) => {
        const value = asRecord(row)[column];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      }),
    );
    return { columns, rows };
  }

  return {
    id: 'sqlite',
    title: 'SQLite',
    initialCardState: {
      query: {
        sql: 'SELECT name FROM sqlite_master ORDER BY name LIMIT 20',
        rowLimit: '20',
        paramsJSON: '',
      },
    },
    cards: {
      home: {
        render() {
          return ui.panel([
            ui.text('SQLite HyperCard Workspace'),
            ui.text('Use cards to run SQL, inspect results, and seed sample data.'),
            ui.row([
              ui.button('Run Query Card', { onClick: { handler: 'go', args: { cardId: 'query' } } }),
              ui.button('Results Card', { onClick: { handler: 'go', args: { cardId: 'results' } } }),
              ui.button('Seed Card', { onClick: { handler: 'go', args: { cardId: 'seed' } } }),
            ]),
          ]);
        },
        handlers: {
          go({ dispatchSystemCommand }, args) {
            dispatchSystemCommand('nav.go', { cardId: asString(asRecord(args).cardId, 'home') });
          },
        },
      },

      query: {
        render({ cardState, globalState }) {
          const state = asRecord(cardState);
          const status = getStatus(globalState);
          const queueDepth = asNumber(status.queueDepth, 0);
          const running = asString(status.runningJobType);
          return ui.panel([
            ui.text('Run SQLite Query'),
            ui.row([
              ui.text('SQL:'),
              ui.input(asString(state.sql), { onChange: { handler: 'setSql' } }),
            ]),
            ui.row([
              ui.text('Row Limit:'),
              ui.input(asString(state.rowLimit), { onChange: { handler: 'setRowLimit' } }),
            ]),
            ui.row([
              ui.text('Params JSON:'),
              ui.input(asString(state.paramsJSON), { onChange: { handler: 'setParams' } }),
            ]),
            ui.row([
              ui.button('Execute', { onClick: { handler: 'runQuery' } }),
              ui.button('View Results', { onClick: { handler: 'go', args: { cardId: 'results' } } }),
              ui.button('Back', { onClick: { handler: 'back' } }),
            ]),
            ui.badge(`Queue: ${queueDepth}`),
            running ? ui.badge(`Running: ${running}`) : ui.text('Runner idle'),
          ]);
        },
        handlers: {
          setSql({ dispatchCardAction }, args) {
            dispatchCardAction('set', { path: 'sql', value: asString(asRecord(args).value) });
          },
          setRowLimit({ dispatchCardAction }, args) {
            dispatchCardAction('set', { path: 'rowLimit', value: asString(asRecord(args).value) });
          },
          setParams({ dispatchCardAction }, args) {
            dispatchCardAction('set', { path: 'paramsJSON', value: asString(asRecord(args).value) });
          },
          runQuery({ cardState, dispatchDomainAction, dispatchSystemCommand }) {
            const state = asRecord(cardState);
            const sql = asString(state.sql).trim();
            if (!sql) {
              dispatchSystemCommand('notify', { message: 'SQL is required.' });
              return;
            }

            const payload = { sql };
            const rowLimit = asNumber(state.rowLimit, 0);
            if (rowLimit > 0) {
              payload.rowLimit = rowLimit;
            }
            Object.assign(payload, parseParams(state.paramsJSON));

            dispatchDomainAction('sqlite', 'query.execute', payload);
            dispatchSystemCommand('nav.go', { cardId: 'results' });
          },
          go({ dispatchSystemCommand }, args) {
            dispatchSystemCommand('nav.go', { cardId: asString(asRecord(args).cardId, 'home') });
          },
          back({ dispatchSystemCommand }) {
            dispatchSystemCommand('nav.back');
          },
        },
      },

      results: {
        render({ globalState }) {
          const result = getQueryResult(globalState);
          const error = getQueryError(globalState);
          const data = buildRowsFromResult(result);
          const meta = asRecord(result.meta);
          const message = asString(error.message);

          return ui.panel([
            ui.text('Query Results'),
            message ? ui.badge(`Error: ${message}`) : ui.text('No error'),
            asArray(data.columns).length > 0
              ? ui.table(data.rows, { headers: data.columns })
              : ui.text('No rows yet. Run a query first.'),
            ui.row([
              ui.text(`Rows: ${asNumber(meta.rowCount, 0)}`),
              ui.text(`Statement: ${asString(meta.statementType, 'N/A')}`),
            ]),
            ui.row([
              ui.button('Run Another Query', { onClick: { handler: 'go', args: { cardId: 'query' } } }),
              ui.button('Back', { onClick: { handler: 'back' } }),
            ]),
          ]);
        },
        handlers: {
          go({ dispatchSystemCommand }, args) {
            dispatchSystemCommand('nav.go', { cardId: asString(asRecord(args).cardId, 'home') });
          },
          back({ dispatchSystemCommand }) {
            dispatchSystemCommand('nav.back');
          },
        },
      },

      seed: {
        render({ globalState }) {
          const report = getSeedReport(globalState);
          const status = getStatus(globalState);
          const lastSeedAt = asString(report.completedAt);
          const queueDepth = asNumber(status.queueDepth, 0);
          const steps = asArray(report.steps).map((step, index) => [
            String(index + 1),
            asString(asRecord(step).label, 'step'),
            asString(asRecord(step).status, 'unknown'),
          ]);

          return ui.panel([
            ui.text('Seed Database'),
            ui.text('Runs a deterministic sample seed pipeline through /query.'),
            ui.row([
              ui.button('Run Seed', { onClick: { handler: 'runSeed' } }),
              ui.button('Go To Query', { onClick: { handler: 'go', args: { cardId: 'query' } } }),
              ui.button('Back', { onClick: { handler: 'back' } }),
            ]),
            ui.badge(`Queue: ${queueDepth}`),
            lastSeedAt ? ui.text(`Last completed: ${lastSeedAt}`) : ui.text('No seed run completed yet.'),
            steps.length > 0 ? ui.table(steps, { headers: ['#', 'Step', 'Status'] }) : ui.text('No seed report yet.'),
          ]);
        },
        handlers: {
          runSeed({ dispatchDomainAction }) {
            dispatchDomainAction('sqlite', 'seed.execute', { profile: 'people-v1' });
          },
          go({ dispatchSystemCommand }, args) {
            dispatchSystemCommand('nav.go', { cardId: asString(asRecord(args).cardId, 'home') });
          },
          back({ dispatchSystemCommand }) {
            dispatchSystemCommand('nav.back');
          },
        },
      },
    },
  };
});
