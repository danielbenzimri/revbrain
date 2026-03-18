/**
 * ProjectContext — provides the current projectId to the entire component tree.
 * Any component can call useProject() to get project-scoped storage helpers.
 */
import React, { createContext, useContext, useMemo } from 'react';
import {
  getProjectKey,
  loadProjectData,
  loadProjectDataRaw,
  saveProjectData,
  removeProjectData,
} from '../utils/projectStorage';

export interface ProjectContextType {
  /** Current project identifier (e.g. "proj_1709123456789") */
  projectId: string;
  /** Human-readable project name */
  projectName: string;
  /** Build a project-scoped localStorage key */
  getKey: (baseKey: string) => string;
  /** Load & JSON-parse from project-scoped key, with fallback */
  load: <T>(baseKey: string, defaultValue: T) => T;
  /** Load raw string from project-scoped key */
  loadRaw: (baseKey: string) => string | null;
  /** JSON-stringify & save to project-scoped key (quota-safe) */
  save: (baseKey: string, value: string) => void;
  /** Remove a project-scoped key */
  remove: (baseKey: string) => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

interface ProjectProviderProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
}

export function ProjectProvider({ projectId, projectName, children }: ProjectProviderProps) {
  const value = useMemo<ProjectContextType>(
    () => ({
      projectId,
      projectName,
      getKey: (baseKey: string) => getProjectKey(projectId, baseKey),
      load: <T,>(baseKey: string, defaultValue: T) =>
        loadProjectData<T>(projectId, baseKey, defaultValue),
      loadRaw: (baseKey: string) => loadProjectDataRaw(projectId, baseKey),
      save: (baseKey: string, val: string) => saveProjectData(projectId, baseKey, val),
      remove: (baseKey: string) => removeProjectData(projectId, baseKey),
    }),
    [projectId, projectName]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

/**
 * Hook to access the current project context.
 * Must be used within a <ProjectProvider>.
 */
export function useProjectContext(): ProjectContextType {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProjectContext() must be used within a <ProjectProvider>');
  }
  return ctx;
}

export default ProjectContext;
