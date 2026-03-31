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
  comment: string; // user comment/notes (HTML from rich text editor)
}
