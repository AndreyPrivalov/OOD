export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

export type WorkItemId = string;
export type WorkspaceId = string;

export interface WorkItem {
  id: WorkItemId;
  workspaceId: WorkspaceId;
  title: string;
  object: string | null;
  possiblyRemovable: boolean;
  parentId: WorkItemId | null;
  siblingOrder: number;
  overcomplication: Rating | null;
  importance: Rating | null;
  blocksMoney: Rating | null;
  currentProblems: string[];
  solutionVariants: string[];
}

export interface WorkTreeNode extends WorkItem {
  children: WorkTreeNode[];
}

export interface WorkTreeReadNode extends WorkTreeNode {
  overcomplicationSum: number;
  importanceSum: number;
  blocksMoneySum: number;
  children: WorkTreeReadNode[];
}

export interface CreateWorkItemInput {
  workspaceId: WorkspaceId;
  title?: string;
  object?: string | null;
  possiblyRemovable?: boolean;
  parentId?: WorkItemId | null;
  siblingOrder?: number;
  overcomplication?: number | null;
  importance?: number | null;
  blocksMoney?: number | null;
  currentProblems?: string[];
  solutionVariants?: string[];
}

export interface UpdateWorkItemInput {
  title?: string;
  object?: string | null;
  possiblyRemovable?: boolean;
  overcomplication?: number | null;
  importance?: number | null;
  blocksMoney?: number | null;
  currentProblems?: string[];
  solutionVariants?: string[];
}

export interface MoveWorkItemInput {
  targetParentId: WorkItemId | null;
  targetIndex: number;
}
