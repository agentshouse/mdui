export interface OpenPullRequest {
  number: number;
  title: string;
  branch: string;
  head: string;
  body: string;
  tickets: string[];
}

export interface PullRequestView {
  number: number;
  state: string;
  draft: boolean;
  body: string;
  branch: string;
  head: string;
  base: string;
  fork: boolean;
  tickets: string[];
}

export function ticketPathsIn(body: string): string[];
export function ticketRefusals(body: string, read: (ticket: string) => string | null): string[];
export function issueReferences(body: string): string[];
export function hasIssueDirective(body: string, directive: string, issue: number): boolean;
export function hasDirectRequest(body: string): boolean;
export function openPullRequests(options?: { cwd?: string; limit?: number }): OpenPullRequest[];
export function pullRequest(number: number, options?: { cwd?: string }): PullRequestView;
export function issueState(number: number, options?: { cwd?: string }): string | null;
