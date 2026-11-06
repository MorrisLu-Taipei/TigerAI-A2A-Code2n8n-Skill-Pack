# Knowledge files and vector stores

Two different things, often confused.

| | Knowledge files | Vector stores |
|---|---|---|
| What | Files uploaded to the Agent in the UI (Knowledge tab) | An external index you already fill elsewhere: Pinecone, Qdrant, Supabase, Postgres (pgvector) |
| How the Agent reads them | **Not RAG.** Grep-style tools in a sandbox: `find_file` (by name), `search_text` (regex over contents), `read_file` | Semantic search tool `search_<name>`, top 4 results per call |
| Good for | Policies, handbooks, price lists, FAQs, CSVs: text the model can search for exact words | Large corpora where wording varies and exact-match search misses |
| Set up | UI upload; not through MCP | `vectorStores[]` in config |
| Versioned | No. An upload changes the live Agent at once | Config is versioned; the index isn't |

## Knowledge files

- Types: `.csv`, `.md`, `.markdown`, `.pdf` (with a text layer; scanned images have nothing to search), `.txt`.
- Limits: 10 MB per file, 10 files per upload, 1.5 GB per Agent.
- Because search is exact text, tell the Agent in `instructions` what the files are and to search before answering ("Policies are in the knowledge files; search them before answering any policy question and quote the section"). File names matter: `find_file` works on them.
- Only top-level Agents with the sandbox on get these tools.

## Vector stores

```json
"vectorStores": [ {
  "provider": "pinecone", "name": "product_docs",
  "credential": "<pinecone credential id>", "indexName": "docs", "namespace": "v2",
  "embedding": { "model": "openai/text-embedding-3-small", "credential": "<id>" },
  "useWhen": "Search when the user asks how a product feature works."
} ]
```

- `name` (letters, digits, `_`, `-`) becomes the tool `search_<name>`. `useWhen` is its description.
- Provider-specific fields: Pinecone `indexName` (+ `namespace`), Qdrant `collectionName`, Supabase `tableName` (+ `queryName`), Postgres `tableName`.
- Search only: the Agent can't write to the store. Fill it with a workflow (vector store nodes).
- The `embedding` model must match the one used to fill the index.

<!-- TEMPORARY: not yet verified that a store filled by n8n's vector store nodes returns usable content to an Agent (metadata and text column layout). Test once on the target store before promising it works. -->
Before relying on a store filled by n8n's own vector store nodes, run one `call_agent` query and check the answer cites real content.
