import type { Category } from '../types';
import { API_ENDPOINTS } from './config';
import { del, get, patch, post } from './client';
import { camelToSnake, convertResponse } from './transform';

export async function fetchCategories(): Promise<Category[]> {
  const raw = await get<unknown[]>(API_ENDPOINTS.categories);
  return raw.map((v) => convertResponse<Category>(v));
}

export async function createCategory(
  category: Omit<Category, 'createdAt' | 'updatedAt'>,
): Promise<Category> {
  const body = camelToSnake(category);
  const raw = await post<unknown>(API_ENDPOINTS.categories, body);
  return convertResponse<Category>(raw);
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<Category> {
  const body = camelToSnake(updates);
  const raw = await patch<unknown>(`${API_ENDPOINTS.categories}/${id}`, body);
  return convertResponse<Category>(raw);
}

export async function deleteCategory(id: string): Promise<void> {
  return del(`${API_ENDPOINTS.categories}/${id}`);
}
