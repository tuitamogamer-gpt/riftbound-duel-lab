import { cards as data } from "./data/cards";
export interface CatalogCard {
  id: string;
  providerId: string;
  name: string;
  type: string;
  supertype: string | null;
  domains: string[];
  energy: number | null;
  power: number | null;
  might: number | null;
  text: string;
  image: string;
  set: string;
  setName: string;
  rarity: string;
  tags: string[];
  keywords: string[];
  collectorNumber: number;
  variant: boolean;
}
export const catalog = data as CatalogCard[];
export const cardById = new Map(catalog.map((c) => [c.id, c]));
export const findCard = (id: string | undefined) =>
  id ? cardById.get(id) : undefined;
export const domainColors: Record<string, string> = {
  Fury: "#e65d54",
  Calm: "#62c9a6",
  Mind: "#67b7ff",
  Body: "#e59862",
  Chaos: "#ba8bea",
  Order: "#e7c373",
};
