import type { Project } from '../types';
import { API_ENDPOINTS } from './config';
import { del, get, patch, post } from './client';
import { camelToSnake, convertResponse } from './transform';

export async function fetchProjects(): Promise<Project[]> {
  const raw = await get<unknown[]>(API_ENDPOINTS.projects);
  return raw.map((v) => convertResponse<Project>(v));
}

export async function createProject(
  project: Omit<Project, 'createdAt' | 'updatedAt'>,
): Promise<Project> {
  const body = camelToSnake(project);
  const raw = await post<unknown>(API_ENDPOINTS.projects, body);
  return convertResponse<Project>(raw);
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const body = camelToSnake(updates);
  const raw = await patch<unknown>(`${API_ENDPOINTS.projects}/${id}`, body);
  return convertResponse<Project>(raw);
}

export async function deleteProject(id: string): Promise<void> {
  return del(`${API_ENDPOINTS.projects}/${id}`);
}
