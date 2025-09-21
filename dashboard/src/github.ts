import { GitHubSettings } from './types';
import { encodeBase64 } from './utils';

interface GitRefResponse {
  object: { sha: string };
}

interface RepositoryContentResponse {
  sha?: string;
}

interface PullRequestResponse {
  html_url?: string;
  number: number;
}

class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly documentationUrl?: string
  ) {
    super(message);
  }
}

const API_BASE = 'https://api.github.com';

const encodePath = (path: string): string =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

async function githubRequest<T>(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new GitHubError(`Invalid JSON from GitHub (${path})`, response.status);
    }
  }

  if (!response.ok) {
    const message =
      payload?.message ?? `GitHub API error (${response.status}) while calling ${path}`;
    throw new GitHubError(message, response.status, payload?.documentation_url);
  }

  return (payload ?? {}) as T;
}

const ensureInputs = (settings: GitHubSettings, content: string) => {
  if (!settings.pat) {
    throw new Error('GitHub Personal Access Token (PAT) is required');
  }
  if (!settings.owner || !settings.repo) {
    throw new Error('Repository owner and name are required');
  }
  if (!content) {
    throw new Error('Generated configuration YAML is empty');
  }
};

export interface PullRequestResult {
  htmlUrl: string;
  number: number;
  branch: string;
}

export async function createConfigPullRequest(
  settings: GitHubSettings,
  content: string
): Promise<PullRequestResult> {
  ensureInputs(settings, content);

  try {
    const baseBranch = settings.baseBranch || 'main';
    const rawBranchName = settings.branchName?.trim() || `nyaimlab-config-${Date.now()}`;
    const branchName = rawBranchName.replace(/\s+/g, '-');

    const baseRef = await githubRequest<GitRefResponse>(
      settings.pat,
      'GET',
      `/repos/${settings.owner}/${settings.repo}/git/ref/heads/${encodePath(baseBranch)}`
    );

    try {
      await githubRequest<GitRefResponse>(settings.pat, 'POST', `/repos/${settings.owner}/${settings.repo}/git/refs`, {
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha,
      });
    } catch (error) {
      if (error instanceof GitHubError && error.status === 422) {
        await githubRequest(settings.pat, 'PATCH', `/repos/${settings.owner}/${settings.repo}/git/refs/heads/${encodePath(branchName)}`, {
          sha: baseRef.object.sha,
          force: false,
        });
      } else {
        throw error;
      }
    }

    let existingSha: string | undefined;
    try {
      const contentResponse = await githubRequest<RepositoryContentResponse>(
        settings.pat,
        'GET',
        `/repos/${settings.owner}/${settings.repo}/contents/${encodePath(
          settings.configPath || 'config.yaml'
        )}?ref=${encodeURIComponent(branchName)}`
      );
      if (contentResponse && typeof contentResponse.sha === 'string') {
        existingSha = contentResponse.sha;
      }
    } catch (error) {
      if (!(error instanceof GitHubError) || error.status !== 404) {
        throw error;
      }
    }

    await githubRequest(settings.pat, 'PUT', `/repos/${settings.owner}/${settings.repo}/contents/${encodePath(
      settings.configPath || 'config.yaml'
    )}`, {
      message: settings.commitMessage || 'chore: update nyaimlab config',
      content: encodeBase64(content),
      branch: branchName,
      sha: existingSha,
    });

    const pr = await githubRequest<PullRequestResponse>(
      settings.pat,
      'POST',
      `/repos/${settings.owner}/${settings.repo}/pulls`,
      {
        title: settings.prTitle || 'Update Nyaimlab config',
        head: branchName,
        base: baseBranch,
        body: settings.prBody,
        draft: settings.draft ?? true,
      }
    );

    return {
      htmlUrl: pr.html_url ?? '',
      number: pr.number,
      branch: branchName,
    };
  } catch (error) {
    if (error instanceof GitHubError) {
      const docHint = error.documentationUrl ? `\n詳細: ${error.documentationUrl}` : '';
      throw new Error(`[GitHub ${error.status}] ${error.message}${docHint}`);
    }
    throw error;
  }
}
