export type AuthenticatedWorkspace = {
  user: {
    id: number;
    email: string;
    createdAt: Date;
  };
  workspace: {
    id: string;
    name: string;
    createdAt: Date;
  };
  role: 'OWNER';
};
