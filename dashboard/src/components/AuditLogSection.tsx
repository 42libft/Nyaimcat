import { AuditEntry } from '../types';
import { formatDateTime } from '../utils';

interface Props {
  logs: AuditEntry[];
  onRefresh: () => void;
  loading: boolean;
}

const AuditLogSection = ({ logs, onRefresh, loading }: Props) => {
  return (
    <div className="section-card">
      <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>監査ログ</h2>
          <p className="hint">最新 50 件の操作ログを表示します。</p>
        </div>
        <button onClick={onRefresh} disabled={loading}>
          {loading ? '取得中...' : '再読み込み'}
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>日時</th>
              <th>アクション</th>
              <th>結果</th>
              <th>ユーザー</th>
              <th>詳細</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>
                  まだログがありません。
                </td>
              </tr>
            ) : null}
            {logs.map((entry) => (
              <tr key={entry.audit_id}>
                <td>{formatDateTime(entry.timestamp)}</td>
                <td>{entry.action}</td>
                <td>{entry.ok ? 'OK' : `NG: ${entry.error ?? ''}`}</td>
                <td>{entry.actor_id}</td>
                <td>
                  <pre className="code-block" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {JSON.stringify({ payload: entry.payload, ...entry }, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditLogSection;
