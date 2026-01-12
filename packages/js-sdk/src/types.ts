/**
 * Search type for action search
 */
export type SearchType = "vector" | "fulltext" | "hybrid";

/**
 * Search result for actions
 */
export interface ChunkSearchResult {
  success: boolean;
  query: string;
  results: Array<{
    action_id: string;
    content: string;
    score: number;
    createdAt: string;
  }>;
  count: number;
  total: number;
  hasMore: boolean;
}

/**
 * Action detail
 */
export interface ChunkActionDetail {
  action_id: string;
  content: string;
  elements: string | null;
  createdAt: string;
  documentId: number;
  documentTitle: string;
  documentUrl: string;
  chunkIndex: number;
  heading: string | null;
  tokenCount: number;
}

/**
 * Parsed elements from action
 */
export interface ParsedElements {
  [key: string]: {
    css_selector?: string;
    xpath_selector?: string;
    description?: string;
    element_type?: string;
    allow_methods?: string[];
    depends_on?: string;
  };
}

/**
 * Source item
 */
export interface SourceItem {
  id: number;
  name: string;
  baseUrl: string;
  description: string | null;
  domain: string | null;
  tags: string[];
  healthScore: number | null;
  lastCrawledAt: string | null;
  createdAt: string;
}

/**
 * Source list result
 */
export interface SourceListResult {
  success: boolean;
  results: SourceItem[];
  count: number;
}

/**
 * Source search result
 */
export interface SourceSearchResult {
  success: boolean;
  query: string;
  results: SourceItem[];
  count: number;
}

/**
 * Search actions parameters
 */
export interface SearchActionsParams {
  query: string;
  type?: SearchType;
  limit?: number;
  sourceIds?: string;
  minScore?: number;
}
