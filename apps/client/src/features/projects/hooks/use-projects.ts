import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useDB } from '@/hooks/use-services';

export interface Project {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'on_hold';
  progress: number;
  budget: number;
  startDate: string;
  endDate: string;
}

export const PROJECTS_KEY = ['projects'];

export function useProjects() {
  const db = useDB();

  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: async () => {
      const data = await db.query<Project>('projects');
      return data;
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useCreateProject() {
  const db = useDB();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newProject: Omit<Project, 'id'>) => {
      return db.insert<Project>('projects', newProject);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });
}
