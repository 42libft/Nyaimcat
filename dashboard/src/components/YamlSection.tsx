import { FormEvent, useMemo, useState } from 'react';
import { createTwoFilesPatch } from 'diff';
import { GitHubSettings } from '../types';
import { PullRequestResult } from '../github';

interface Props {
  originalYaml: string;
  updatedYaml: string;
  github: GitHubSettings;
  onGitHubChange: (settings: GitHubSettings) => void;
  onCreatePullRequest: (settings: GitHubSettings) => Promise<PullRequestResult>;
}

const YamlSection = ({ originalYaml, updatedYaml, github, onGitHubChange, onCreatePullRequest }: Props) => {
  const [status, setStatus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const diffText = useMemo(() => {
    if (!originalYaml && !updatedYaml) {
      return '変更はありません。';
    }
    return createTwoFilesPatch('config.yaml', 'config.yaml', originalYaml, updatedYaml);
  }, [originalYaml, updatedYaml]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(updatedYaml);
      setStatus('更新後の YAML をコピーしました。');
    } catch (error: any) {
      setStatus(error?.message ?? 'クリップボードへのコピーに失敗しました');
    }
  };

  const handleGitHubField = (field: keyof GitHubSettings) =>
    (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value =
        event.currentTarget instanceof HTMLInputElement && event.currentTarget.type === 'checkbox'
          ? (event.currentTarget as HTMLInputElement).checked
          : event.currentTarget.value;
      onGitHubChange({ ...github, [field]: value } as GitHubSettings);
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    try {
      const result = await onCreatePullRequest(github);
      const url = result.htmlUrl ? ` (${result.htmlUrl})` : '';
      setStatus(`GitHub PR #${result.number} を作成しました${url}`);
    } catch (error: any) {
      setStatus(error?.message ?? 'PR 作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="section-card">
      <h2>YAML 差分 & Pull Request</h2>
      {status ? <div className="status-bar">{status}</div> : null}
      <div className="actions-row" style={{ marginBottom: 16 }}>
        <button type="button" onClick={handleCopy}>
          YAML をコピー
        </button>
      </div>
      <div className="diff-output">{diffText}</div>
      <form className="form-grid" style={{ marginTop: 24 }} onSubmit={handleSubmit}>
        <h3>GitHub Pull Request</h3>
        <div className="field">
          <label htmlFor="gh-pat">Personal Access Token</label>
          <input id="gh-pat" value={github.pat} onChange={handleGitHubField('pat')} type="password" required />
        </div>
        <div className="form-grid two-columns">
          <div className="field">
            <label htmlFor="gh-owner">Owner</label>
            <input id="gh-owner" value={github.owner} onChange={handleGitHubField('owner')} required />
          </div>
          <div className="field">
            <label htmlFor="gh-repo">Repository</label>
            <input id="gh-repo" value={github.repo} onChange={handleGitHubField('repo')} required />
          </div>
          <div className="field">
            <label htmlFor="gh-base">Base Branch</label>
            <input id="gh-base" value={github.baseBranch} onChange={handleGitHubField('baseBranch')} />
          </div>
          <div className="field">
            <label htmlFor="gh-branch">新規ブランチ名 (任意)</label>
            <input id="gh-branch" value={github.branchName} onChange={handleGitHubField('branchName')} />
          </div>
          <div className="field">
            <label htmlFor="gh-path">Config パス</label>
            <input id="gh-path" value={github.configPath} onChange={handleGitHubField('configPath')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="gh-title">PR タイトル</label>
          <input id="gh-title" value={github.prTitle} onChange={handleGitHubField('prTitle')} />
        </div>
        <div className="field">
          <label htmlFor="gh-body">PR 本文</label>
          <textarea id="gh-body" value={github.prBody} onChange={handleGitHubField('prBody')} />
        </div>
        <div className="field">
          <label htmlFor="gh-message">コミットメッセージ</label>
          <input id="gh-message" value={github.commitMessage} onChange={handleGitHubField('commitMessage')} />
        </div>
        <div className="field">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={github.draft}
              onChange={handleGitHubField('draft') as any}
            />
            Draft PR として作成
          </label>
        </div>
        <button type="submit" disabled={creating}>
          {creating ? '作成中...' : 'Pull Request を作成'}
        </button>
      </form>
    </div>
  );
};

export default YamlSection;
