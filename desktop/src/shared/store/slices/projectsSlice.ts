// Projects Slice — 项目管理状态
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { Project, Task } from '../../types';
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  updateProject as apiUpdateProject,
} from '../../api';
import { generateId } from '../constants';

export interface ProjectsSlice {
  projects: Project[];
  selectedProject: Project | null;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  selectProject: (project: Project | null) => void;
  archiveProject: (id: string) => void;
  getProjectTasks: (projectId: string) => Task[];
}

export const createProjectsSlice: StateCreator<AppStore, [], [], ProjectsSlice> = (set, get) => ({
  projects: [],
  selectedProject: null,

  addProject: (project) => {
    const id = generateId();
    const newProject: Project = {
      ...project,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    set((state) => ({ projects: [...state.projects, newProject] }));
    get().saveData();

    if (get().apiAvailable) {
      apiCreateProject({ ...project, id })
        .then((created) => {
          set((state) => ({
            projects: state.projects.map((p) => (p.id === id ? created : p)),
          }));
        })
        .catch((error) => console.warn('API create project failed:', error));
    }

    return id;
  },

  updateProject: (id, updates) => {
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === id ? { ...project, ...updates, updatedAt: new Date() } : project
      ),
    }));
    get().saveData();

    if (get().apiAvailable) {
      apiUpdateProject(id, updates).catch((error) =>
        console.warn('API update project failed:', error),
      );
    }
  },

  deleteProject: (id) => {
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== id),
      selectedProject: state.selectedProject?.id === id ? null : state.selectedProject,
    }));
    get().saveData();

    if (get().apiAvailable) {
      apiDeleteProject(id).catch((error) =>
        console.warn('API delete project failed:', error),
      );
    }
  },

  selectProject: (project) => set({ selectedProject: project }),

  archiveProject: (id) => {
    get().updateProject(id, { isArchived: true, status: 'archived' });
  },

  getProjectTasks: (projectId) => {
    return get().tasks.filter((task) => task.projectId === projectId);
  },
});
