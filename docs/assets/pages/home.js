import {
  clear,
  createButton,
  createSection,
  formField,
  el,
  textInput,
  toggleLoading,
} from "../ui.js";

export async function renderHome({ state, root, showToast }) {
  const section = createSection("API接続", "FastAPI 管理バックエンドへの接続情報を設定します。");
  const form = el("form", { className: "connection-form" });

  const baseUrlInput = textInput({
    type: "url",
    value: state.apiBaseUrl,
    placeholder: "https://example.com",
  });
  const tokenInput = textInput({ type: "password", value: state.sessionToken });
  const guildInput = textInput({ value: state.guildId, placeholder: "1234567890", required: true });
  const actorInput = textInput({ value: state.actorId, placeholder: "操作者のDiscord ID", required: true });
  const clientInput = textInput({ value: state.clientId, placeholder: "pages-dashboard" });

  form.append(
    formField("API Base URL", baseUrlInput, "FastAPI が動作しているホストのURL"),
    formField("セッショントークン", tokenInput, "Bearer 認証に利用されるAPIトークン"),
    formField("Guild ID", guildInput, "操作対象のギルドID"),
    formField("Operator User ID", actorInput, "監査ログに記録される操作者"),
    formField("Client ID", clientInput, "x-client ヘッダーに利用"),
  );

  const actions = el("div", { className: "inline-actions" });
  const saveButton = createButton("接続情報を保存", { type: "submit" });
  const reloadButton = createButton("サーバーから設定を取得", { variant: "secondary" });

  actions.append(saveButton, reloadButton);
  form.append(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.updateConnection({
      apiBaseUrl: baseUrlInput.value,
      sessionToken: tokenInput.value,
      guildId: guildInput.value,
      actorId: actorInput.value,
      clientId: clientInput.value,
    });
    state.clearSnapshot();
    showToast("接続情報を保存しました。", "success");
  });

  reloadButton.addEventListener("click", async () => {
    if (!state.isReady()) {
      showToast("接続情報を先に入力してください。", "error");
      return;
    }
    toggleLoading(section, true);
    try {
      await state.pullSnapshot();
      showToast("設定を再読み込みしました。", "success");
    } catch (error) {
      showToast(error.message || "設定の取得に失敗しました。", "error");
    } finally {
      toggleLoading(section, false);
      clear(root);
      await renderHome({ state, root, showToast });
    }
  });

  section.append(form);
  root.append(section);

  const statusPanel = createSection("現在の状態");
  const statusList = el("ul");
  statusList.append(
    el("li", {}, state.isReady() ? "APIに接続できます" : "API接続が未設定です"),
    el("li", {}, state.snapshot ? "サーバー設定を読み込み済み" : "サーバー設定は未取得です"),
  );
  statusPanel.append(statusList);

  if (state.snapshot) {
    const summary = el("div", { className: "summary-grid" });
    const sections = [
      ["Welcome", state.snapshot.welcome ? "設定済み" : "未設定"],
      ["ガイドラインDM", state.snapshot.guideline ? "設定済み" : "未設定"],
      ["Verify", state.snapshot.verify ? "設定済み" : "未設定"],
      ["ロール配布", state.snapshot.roles ? `${state.snapshot.roles.roles?.length || 0} 件` : "未設定"],
      ["自己紹介", state.snapshot.introduce ? "設定済み" : "未設定"],
      ["スクリム", state.snapshot.scrims ? "設定済み" : "未設定"],
    ];
    sections.forEach(([title, value]) => {
      const card = el("div", { className: "summary-card" });
      card.append(el("h3", { textContent: title }), el("p", { textContent: value }));
      summary.append(card);
    });
    statusPanel.append(summary);
  }

  root.append(statusPanel);
}
