export interface HextechExport {
  sourceUrl: string;
  pageCount: number;
  count: number;
  fetchedAt: string;
  cards: Record<string, unknown>[];
}
export const HEXTECH_BASE: string;
export function hextechUrl(query: string, page?: number): string;
export function parseHextechPage(html: string): {
  cards: Record<string, unknown>[];
  total: number | null;
};
export function fetchHextechText(
  url: string,
  options?: { attempts?: number },
): Promise<string>;
export function buildHextechExport(
  query: string,
  options?: {
    fetchText?: (url: string) => Promise<string>;
    onPage?: (page: number, pages: number) => void;
  },
): Promise<HextechExport>;
