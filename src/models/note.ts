export interface Note {
  id: string;
  title: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
  tags: string[];
  filePath: string; // absolute path to the .md file
}
