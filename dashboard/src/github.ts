import { Octokit } from '@octokit/rest';
import { GitHubSettings } from './types';
import { encodeBase64 } from './utils';

export interface PullRequestResult {
  htmlUrl: string;
  number: number;
  branch: string;
}

export async function createConfigPullRequest(
  settings: GitHubSettings,
  content: string
): Promise<PullRequestResult> {
  if (!settings.pat) {
    throw new Error('GitHub Personal Access Token (PAT) is required');
  }
  if (!settings.owner || !settings.repo) {
    throw new Error('Repository owner and name are required');
  }

  const octokit = new Octokit({ auth: settings.pat });
  const baseBranch = settings.baseBranch || 'main';
  const branchName = settings.branchName || `nyaimlab-config-${Date.now()}`;

  const baseRef = await octokit.git.getRef({
    owner: settings.owner,
    repo: settings.repo,
    ref: `heads/${baseBranch}`,
  });

  try {
    await octokit.git.createRef({
      owner: settings.owner,
      repo: settings.repo,
      ref: `refs/heads/${branchName}`,
      sha: baseRef.data.object.sha,
    });
  } catch (error: any) {
    if (error.status !== 422) {
      throw error;
    }
    // Branch already exists – keep going and update the file on that branch.
  }

  let existingSha: string | undefined;
  try {
    const current = await octokit.repos.getContent({
      owner: settings.owner,
      repo: settings.repo,
      path: settings.configPath || 'config.yaml',
      ref: branchName,
    });
    if (!Array.isArray(current.data)) {
      existingSha = current.data.sha;
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }

  await octokit.repos.createOrUpdateFileContents({
    owner: settings.owner,
    repo: settings.repo,
    path: settings.configPath || 'config.yaml',
    message: settings.commitMessage || 'chore: update nyaimlab config',
    content: encodeBase64(content),
    branch: branchName,
    sha: existingSha,
  });

  const pr = await octokit.pulls.create({
    owner: settings.owner,
    repo: settings.repo,
    title: settings.prTitle || 'Update Nyaimlab config',
    head: branchName,
    base: baseBranch,
    body: settings.prBody,
    draft: settings.draft,
  });

  return {
    htmlUrl: pr.data.html_url ?? '',
    number: pr.data.number,
    branch: branchName,
  };
}
