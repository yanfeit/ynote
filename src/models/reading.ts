export interface Reading {
  id: string;
  url: string;
  title: string;
  author: string;
  organization: string;
  abstract: string;
  addedAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
  tags: string[];
  source: string; // domain extracted from URL
}
