import type { CardDefinition, CardStackDefinition } from '@hypercard/engine';
import { SQLITE_PLUGIN_BUNDLE } from './pluginBundle';

interface SqliteCardMeta {
  id: string;
  title: string;
  icon: string;
}

const SQLITE_CARD_META: SqliteCardMeta[] = [
  { id: 'home', title: 'SQLite Home', icon: 'DB' },
  { id: 'query', title: 'Run Query', icon: 'Q' },
  { id: 'results', title: 'Results', icon: 'R' },
  { id: 'seed', title: 'Seed Data', icon: 'S' },
];

function toPluginCard(card: SqliteCardMeta): CardDefinition {
  return {
    id: card.id,
    type: 'plugin',
    title: card.title,
    icon: card.icon,
    ui: {
      t: 'text',
      value: `SQLite card placeholder: ${card.id}`,
    },
  };
}

export const SQLITE_STACK: CardStackDefinition = {
  id: 'sqlite',
  name: 'SQLite',
  icon: 'DB',
  homeCard: 'home',
  plugin: {
    bundleCode: SQLITE_PLUGIN_BUNDLE,
    capabilities: {
      domain: ['sqlite', 'app_sqlite'],
      system: ['nav.go', 'nav.back', 'notify.show'],
    },
  },
  cards: Object.fromEntries(SQLITE_CARD_META.map((card) => [card.id, toPluginCard(card)])),
};
