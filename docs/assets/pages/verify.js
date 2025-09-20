import {
  clear,
  createButton,
  createSection,
  el,
  ensureSnapshot,
  formField,
  select,
  textInput,
  textarea,
  toggleLoading,
} from "../ui.js";

const defaultVerify = {
  channel_id: "",
  role_id: "",
  mode: "button",
  prompt: "ボタンを押して認証を完了してください。",
  message_id: "",
};

export async function renderVerify({ state, root, showToast }) {
  const snapshot = await ensureSnapshot(state, root).catch(() => null);
  if (!snapshot) {
    return;
  }

  const config = { ...defaultVerify, ...(snapshot.verify || {}) };

  const section = createSection("Verify メッセージ", "認証用のメッセージを設置します。");
  const form = el("form");
  const channelInput = textInput({ value: config.channel_id, placeholder: "チャンネルID", required: true });
  const roleInput = textInput({ value: config.role_id, placeholder: "付与するロールID", required: true });
  const modeSelect = select({
    value: config.mode,
    options: [
      { value: "button", label: "ボタン" },
      { value: "reaction", label: "リアクション" },
    ],
  });
  const promptArea = textarea({ value: config.prompt || defaultVerify.prompt, rows: 4 });
  const messageIdInput = textInput({ value: config.message_id || "", placeholder: "既存メッセージID (任意)" });

  form.append(
    formField("チャンネルID", channelInput),
    formField("付与ロールID", roleInput),
    formField("方式", modeSelect),
    formField("案内文", promptArea),
    formField("既存メッセージID", messageIdInput, "編集する場合のみ指定"),
  );

  const actions = el("div", { className: "inline-actions" });
  const submitButton = createButton("保存", { type: "submit" });
  const removeButton = createButton("削除", { variant: "danger" });
  actions.append(submitButton, removeButton);
  form.append(actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      channel_id: channelInput.value.trim(),
      role_id: roleInput.value.trim(),
      mode: modeSelect.value,
      prompt: promptArea.value.trim() || defaultVerify.prompt,
      message_id: messageIdInput.value.trim() || null,
    };

    toggleLoading(form, true);
    try {
      const data = await state.request("/api/verify.post", payload);
      if (data.config) {
        state.updateSnapshot("verify", data.config);
      }
      showToast("Verify 設定を保存しました。", "success");
      clear(root);
      await renderVerify({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "保存に失敗しました。", "error");
    } finally {
      toggleLoading(form, false);
    }
  });

  removeButton.addEventListener("click", async () => {
    if (!state.snapshot?.verify) {
      showToast("現在の設定はありません。", "info");
      return;
    }
    toggleLoading(form, true);
    try {
      await state.request("/api/verify.remove", {});
      state.updateSnapshot("verify", null);
      showToast("Verify メッセージを削除しました。", "success");
      clear(root);
      await renderVerify({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "削除に失敗しました。", "error");
    } finally {
      toggleLoading(form, false);
    }
  });

  section.append(form);
  root.append(section);
}
