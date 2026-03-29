// @ts-check
defineRuntimeBundle(({ ui }) => {
  function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toText(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function draftState(state) {
    return asRecord(asRecord(state).draft);
  }

  function sqliteDomain(state) {
    return asRecord(asRecord(state).app_sqlite);
  }

  function hypercardState(state) {
    return asRecord(sqliteDomain(state).hypercard);
  }

  function queryResult(state) {
    return asRecord(hypercardState(state).lastQueryResult);
  }

  function queryError(state) {
    return asRecord(hypercardState(state).lastQueryError);
  }

  function seedReport(state) {
    return asRecord(hypercardState(state).lastSeedReport);
  }

  function statusState(state) {
    return asRecord(hypercardState(state).status);
  }

  function parseParams(text) {
    const trimmed = toText(text).trim();
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
    const columns = asArray(result.columns).map((column) => toText(asRecord(column).name));
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

  function setDraft(context, path, value) {
    context.dispatch({ type: 'draft.set', payload: { path, value } });
  }

  function navigate(context, surfaceId) {
    context.dispatch({ type: 'nav.go', payload: { surfaceId: toText(surfaceId, 'home') } });
  }

  function goBack(context) {
    context.dispatch({ type: 'nav.back' });
  }

  function notify(context, message) {
    context.dispatch({ type: 'notify.show', payload: { message: toText(message) } });
  }

  function dispatchSqlite(context, actionType, payload) {
    context.dispatch({ type: 'sqlite/' + actionType, payload });
  }

  return {
    id: 'sqlite',
    title: 'SQLite',
    packageIds: ["ui"],
    initialSurfaceState: {
      query: {
        sql: 'SELECT name FROM sqlite_master ORDER BY name LIMIT 20',
        rowLimit: '20',
        paramsJSON: '',
      },
    },
    surfaces: {
      home: {
        render() {
          return ui.panel([
            ui.text('SQLite HyperCard Workspace'),
            ui.text('Use cards to run SQL, inspect results, and seed sample data.'),
            ui.row([
              ui.button('Run Query Surface', { onClick: { handler: 'go', args: { surfaceId: 'query' } } }),
              ui.button('Results Surface', { onClick: { handler: 'go', args: { surfaceId: 'results' } } }),
              ui.button('Seed Surface', { onClick: { handler: 'go', args: { surfaceId: 'seed' } } }),
            ]),
          ]);
        },
        handlers: {
          go(context, args) {
            navigate(context, asRecord(args).surfaceId);
          },
        },
      },

      query: {
        render({ state }) {
          const draft = draftState(state);
          const status = statusState(state);
          const queueDepth = toNumber(status.queueDepth, 0);
          const running = toText(status.runningJobType);
          return ui.panel([
            ui.text('Run SQLite Query'),
            ui.row([
              ui.text('SQL:'),
              ui.input(toText(draft.sql), { onChange: { handler: 'setSql' } }),
            ]),
            ui.row([
              ui.text('Row Limit:'),
              ui.input(toText(draft.rowLimit), { onChange: { handler: 'setRowLimit' } }),
            ]),
            ui.row([
              ui.text('Params JSON:'),
              ui.input(toText(draft.paramsJSON), { onChange: { handler: 'setParams' } }),
            ]),
            ui.row([
              ui.button('Execute Query', { onClick: { handler: 'runQuery' } }),
              ui.button('View Results', { onClick: { handler: 'go', args: { surfaceId: 'results' } } }),
              ui.button('Back', { onClick: { handler: 'back' } }),
            ]),
            ui.badge('Queued: ' + queueDepth),
            running ? ui.badge('Executing ' + running + '\u2026') : ui.text('Idle'),
          ]);
        },
        handlers: {
          setSql(context, args) {
            setDraft(context, 'sql', asRecord(args).value);
          },
          setRowLimit(context, args) {
            setDraft(context, 'rowLimit', asRecord(args).value);
          },
          setParams(context, args) {
            setDraft(context, 'paramsJSON', asRecord(args).value);
          },
          runQuery(context) {
            const draft = draftState(context.state);
            const sql = toText(draft.sql).trim();
            if (!sql) {
              notify(context, 'SQL is required.');
              return;
            }

            const payload = { sql };
            const rowLimit = toNumber(draft.rowLimit, 0);
            if (rowLimit > 0) {
              payload.rowLimit = rowLimit;
            }
            Object.assign(payload, parseParams(draft.paramsJSON));

            dispatchSqlite(context, 'query.execute', payload);
            navigate(context, 'results');
          },
          go(context, args) {
            navigate(context, asRecord(args).surfaceId);
          },
          back(context) {
            goBack(context);
          },
        },
      },

      results: {
        render({ state }) {
          const result = queryResult(state);
          const error = queryError(state);
          const data = buildRowsFromResult(result);
          const meta = asRecord(result.meta);
          const message = toText(error.message);

          return ui.panel([
            ui.text('Query Results'),
            message ? ui.badge('Error: ' + message) : ui.text('No error'),
            asArray(data.columns).length > 0
              ? ui.table(data.rows, { headers: data.columns })
              : ui.text('No results yet. Execute a query to see results here.'),
            ui.row([
              ui.text('Rows: ' + toNumber(meta.rowCount, 0)),
              ui.text('Statement: ' + toText(meta.statementType, 'N/A')),
            ]),
            ui.row([
              ui.button('Run Another Query', { onClick: { handler: 'go', args: { surfaceId: 'query' } } }),
              ui.button('Back', { onClick: { handler: 'back' } }),
            ]),
          ]);
        },
        handlers: {
          go(context, args) {
            navigate(context, asRecord(args).surfaceId);
          },
          back(context) {
            goBack(context);
          },
        },
      },

      seed: {
        render({ state }) {
          const report = seedReport(state);
          const status = statusState(state);
          const lastSeedAt = toText(report.completedAt);
          const queueDepth = toNumber(status.queueDepth, 0);
          const running = toText(status.runningJobType);
          const steps = asArray(report.steps).map((step, index) => [
            String(index + 1),
            toText(asRecord(step).label, 'step'),
            toText(asRecord(step).status, 'unknown'),
          ]);

          return ui.panel([
            ui.text('Seed Database'),
            ui.text('Runs a deterministic sample seed pipeline through /query.'),
            ui.row([
              ui.button('Run Seed Pipeline', { onClick: { handler: 'runSeed' } }),
              ui.button('Go To Query', { onClick: { handler: 'go', args: { surfaceId: 'query' } } }),
              ui.button('Back', { onClick: { handler: 'back' } }),
            ]),
            ui.badge('Queued: ' + queueDepth),
            running ? ui.badge('Executing ' + running + '\u2026') : ui.text('Idle'),
            lastSeedAt
              ? ui.text('Last completed: ' + lastSeedAt)
              : ui.text('No seed runs yet. Click Run Seed Pipeline to populate the database with sample data.'),
            steps.length > 0
              ? ui.table(steps, { headers: ['#', 'Step', 'Status'] })
              : ui.text('No seed report yet. Run the pipeline to see step results.'),
          ]);
        },
        handlers: {
          runSeed(context) {
            dispatchSqlite(context, 'seed.execute', { profile: 'people-v1' });
          },
          go(context, args) {
            navigate(context, asRecord(args).surfaceId);
          },
          back(context) {
            goBack(context);
          },
        },
      },
    },
  };
});
