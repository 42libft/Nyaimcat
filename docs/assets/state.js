const STORAGE_KEY = "nyaimcat.dashboard.connection.v1";

export class DashboardState {
  constructor() {
    this.apiBaseUrl = "";
    this.sessionToken = "";
    this.guildId = "";
    this.actorId = "";
    this.clientId = "pages-dashboard";
    this.snapshot = null;
    this.loadingSnapshot = false;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw);
      this.apiBaseUrl = data.apiBaseUrl || "";
      this.sessionToken = data.sessionToken || "";
      this.guildId = data.guildId || "";
      this.actorId = data.actorId || "";
      this.clientId = data.clientId || "pages-dashboard";
    } catch (error) {
      console.warn("Failed to load dashboard settings", error);
    }
  }

  save() {
    const payload = {
      apiBaseUrl: this.apiBaseUrl,
      sessionToken: this.sessionToken,
      guildId: this.guildId,
      actorId: this.actorId,
      clientId: this.clientId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  updateConnection(values) {
    const { apiBaseUrl, sessionToken, guildId, actorId, clientId } = values;
    if (apiBaseUrl !== undefined) {
      this.apiBaseUrl = apiBaseUrl.trim();
    }
    if (sessionToken !== undefined) {
      this.sessionToken = sessionToken.trim();
    }
    if (guildId !== undefined) {
      this.guildId = guildId.trim();
    }
    if (actorId !== undefined) {
      this.actorId = actorId.trim();
    }
    if (clientId !== undefined) {
      this.clientId = clientId.trim() || "pages-dashboard";
    }
    this.save();
  }

  clearSnapshot() {
    this.snapshot = null;
  }

  isReady() {
    return Boolean(this.apiBaseUrl && this.sessionToken && this.guildId && this.actorId);
  }

  apiUrl(path) {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    return `${this.apiBaseUrl.replace(/\/$/, "")}${path}`;
  }

  async request(path, payload = undefined, { method = "POST" } = {}) {
    if (!this.isReady()) {
      throw new Error("API接続情報を先に保存してください。");
    }

    const url = this.apiUrl(path);
    const headers = {
      Authorization: `Bearer ${this.sessionToken}`,
      "x-client": this.clientId || "pages-dashboard",
      "x-guild-id": this.guildId,
      "x-user-id": this.actorId,
    };

    const options = { method, headers };
    if (payload !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(payload);
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      throw new Error("ネットワークエラーが発生しました。");
    }

    let body = null;
    try {
      body = await response.json();
    } catch (error) {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      throw new Error("応答の解析に失敗しました。");
    }

    if (!response.ok || body.ok === false) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    return body.data || {};
  }

  async pullSnapshot() {
    if (this.loadingSnapshot) {
      return this.snapshot;
    }
    this.loadingSnapshot = true;
    try {
      const data = await this.request("/api/state.snapshot", {});
      this.snapshot = data.state || {};
      return this.snapshot;
    } finally {
      this.loadingSnapshot = false;
    }
  }

  updateSnapshot(section, value) {
    if (!this.snapshot) {
      this.snapshot = {};
    }
    this.snapshot[section] = value;
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
  }
}
