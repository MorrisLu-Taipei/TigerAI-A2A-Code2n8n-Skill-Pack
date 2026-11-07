// 節點版本目錄（docs/node-versions/<版本>.json）與提示詞用的節點清單。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadCatalog(version, packRoot = PACK_ROOT) {
  const file = join(packRoot, 'docs', 'node-versions', `${version}.json`);
  if (!existsSync(file)) throw new Error(`找不到節點版本目錄 docs/node-versions/${version}.json`);
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return new Map(j.nodes.map(n => [n.name, n]));
}

export const recommendedVersion = entry => entry.default ?? entry.latest;

const B = 'n8n-nodes-base.';
const L = '@n8n/n8n-nodes-langchain.';

// 常用節點（提示用）；實際版本一律從目錄取，不寫死數字
export const CURATED_TYPES = [
  ...['webhook', 'scheduleTrigger', 'manualTrigger', 'formTrigger', 'form', 'telegramTrigger', 'gmailTrigger', 'slackTrigger',
    'executeWorkflowTrigger', 'errorTrigger', 'googleSheetsTrigger', 'googleDriveTrigger', 'emailReadImap', 'rssFeedRead',
    'respondToWebhook', 'set', 'if', 'switch', 'filter', 'merge', 'code', 'httpRequest', 'noOp', 'wait', 'splitInBatches',
    'splitOut', 'aggregate', 'summarize', 'sort', 'limit', 'removeDuplicates', 'dateTime', 'crypto', 'executeWorkflow',
    'stopAndError', 'extractFromFile', 'convertToFile', 'xml', 'html', 'markdown', 'readWriteFile', 'dataTable',
    'compareDatasets', 'slack', 'telegram', 'gmail', 'emailSend', 'googleSheets', 'googleDrive', 'googleCalendar',
    'microsoftTeams', 'notion', 'airtable', 'postgres', 'mySql', 'github', 'jira', 'discord', 'mattermost', 'whatsApp',
    'httpRequestTool', 'googleSheetsTool', 'slackTool', 'gmailTool', 'emailSendTool', 'postgresTool', 'googleCalendarTool',
    'stickyNote'].map(n => B + n),
  ...['chatTrigger', 'agent', 'agentTool', 'chainLlm', 'chainRetrievalQa', 'lmChatOpenAi', 'lmChatOllama', 'embeddingsOpenAi',
    'embeddingsOllama', 'memoryBufferWindow', 'outputParserStructured', 'informationExtractor', 'textClassifier',
    'sentimentAnalysis', 'documentDefaultDataLoader', 'textSplitterRecursiveCharacterTextSplitter', 'vectorStoreInMemory',
    'vectorStoreQdrant', 'vectorStorePGVector', 'retrieverVectorStore', 'toolVectorStore', 'toolWorkflow', 'toolCode',
    'toolCalculator', 'mcpTrigger', 'mcpClientTool', 'guardrails'].map(n => L + n),
];

// mode：curated（預設）、none、full
export function nodeHintLines(catalog, mode = 'curated') {
  if (mode === 'none') return [];
  let types;
  if (mode === 'full') {
    types = [...catalog.values()].filter(n => !n.deprecated && !n.hidden).map(n => n.name).sort();
  } else {
    types = CURATED_TYPES;
  }
  const lines = [];
  for (const t of types) {
    const e = catalog.get(t);
    if (!e || e.deprecated || e.hidden) continue;
    lines.push(`${t}  typeVersion=${recommendedVersion(e)}`);
  }
  return lines;
}
