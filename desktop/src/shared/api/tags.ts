import type { Tag } from '../types';
import { API_ENDPOINTS } from './config';
import { del, get, patch, post } from './client';
import { camelToSnake, convertResponse } from './transform';

export async function fetchTags(): Promise<Tag[]> {
  const raw = await get<unknown[]>(API_ENDPOINTS.tags);
  return raw.map((v) => convertResponse<Tag>(v));
}

export async function createTag(tag: Omit<Tag, 'createdAt' | 'updatedAt'>): Promise<Tag> {
  const body = camelToSnake(tag);
  const raw = await post<unknown>(API_ENDPOINTS.tags, body);
  return convertResponse<Tag>(raw);
}

export async function updateTag(id: string, updates: Partial<Tag>): Promise<Tag> {
  const body = camelToSnake(updates);
  const raw = await patch<unknown>(`${API_ENDPOINTS.tags}/${id}`, body);
  return convertResponse<Tag>(raw);
}

export async function deleteTag(id: string): Promise<void> {
  return del(`${API_ENDPOINTS.tags}/${id}`);
}
