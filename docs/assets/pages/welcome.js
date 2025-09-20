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

const defaultWelcome = {
  channel_id: "",
  title_template: "ようこそ、{username} さん！",
  description_template: "あなたは **#{member_index}** 人目のメンバーです。",
  member_index_mode: "exclude_bots",
  join_field_label: "加入日時",
  join_timezone: "Asia/Tokyo",
  footer_text: "Nyaimlab",
  thread_name_template: "",
  buttons: [],
};

function createButtonRow(buttonsContainer, initial = {}) {
  const row = el("div", { className: "button-row" });
  const labelInput = textInput({ value: initial.label || "", placeholder: "ガイドを見る" });
  labelInput.dataset.field = "label";
  const targetSelect = select({
    value: initial.target || "url",
    options: [
      { value: "url", label: "外部URL" },
      { value: "channel", label: "Discordチャンネル" },
    ],
  });
  targetSelect.dataset.field = "target";
  const valueInput = textInput({
    value: initial.value || "",
    placeholder: initial.target === "channel" ? "123456789" : "https://",
  });
  valueInput.dataset.field = "value";
  const emojiInput = textInput({ value: initial.emoji || "", placeholder: "🔔" });
  emojiInput.dataset.field = "emoji";

  targetSelect.addEventListener("change", () => {
    valueInput.placeholder = targetSelect.value === "channel" ? "123456789" : "https://";
  });

  row.append(
    formField("ラベル", labelInput),
    formField("遷移タイプ", targetSelect),
    formField("リンク/チャンネルID", valueInput),
    formField("絵文字 (任意)", emojiInput),
  );

  const removeBtn = createButton("削除", { variant: "secondary" });
  removeBtn.addEventListener("click", () => row.remove());
  row.append(el("div", { className: "inline-actions" }, removeBtn));
  buttonsContainer.append(row);
}

export async function renderWelcome({ state, root, showToast }) {
  const snapshot = await ensureSnapshot(state, root).catch(() => null);
  if (!snapshot) {
    return;
  }

  const config = { ...defaultWelcome, ...(snapshot.welcome || {}) };

  const section = createSection(
    "Welcome Embed",
    "入室時に投稿する埋め込みメッセージとボタンを設定します。",
  );

  const form = el("form");
  const channelInput = textInput({ value: config.channel_id, placeholder: "チャンネルID", required: true });
  const titleInput = textInput({ value: config.title_template });
  const descriptionArea = textarea({ value: config.description_template, rows: 4 });
  const memberIndexSelect = select({
    value: config.member_index_mode,
    options: [
      { value: "exclude_bots", label: "Botを除外" },
      { value: "include_bots", label: "Botを含める" },
    ],
  });
  const joinLabelInput = textInput({ value: config.join_field_label });
  const timezoneSelect = select({
    value: config.join_timezone,
    options: [
      { value: "Asia/Tokyo", label: "JST (日本)" },
      { value: "UTC", label: "UTC" },
    ],
  });
  const footerInput = textInput({ value: config.footer_text });
  const threadInput = textInput({ value: config.thread_name_template || "", placeholder: "歓迎スレッド {username}" });

  form.append(
    formField("投稿チャンネルID", channelInput),
    formField("タイトルテンプレート", titleInput),
    formField("本文テンプレート", descriptionArea, "Discord の書式と {username} などのプレースホルダーが利用できます"),
    formField("メンバー番号のカウント方法", memberIndexSelect),
    formField("加入日時ラベル", joinLabelInput),
    formField("加入日時のタイムゾーン", timezoneSelect),
    formField("フッター文字列", footerInput),
    formField("スレッド名テンプレート (任意)", threadInput),
  );

  const buttonsSection = el("div", { className: "buttons-editor" });
  buttonsSection.append(el("h3", { textContent: "ボタン設定" }));
  const buttonsContainer = el("div", { className: "button-list" });
  (config.buttons || []).forEach((btn) => createButtonRow(buttonsContainer, btn));
  if (!buttonsContainer.childElementCount) {
    createButtonRow(buttonsContainer);
  }
  const addButton = createButton("ボタンを追加", { variant: "secondary" });
  addButton.addEventListener("click", () => createButtonRow(buttonsContainer));
  buttonsSection.append(buttonsContainer, el("div", { className: "inline-actions" }, addButton));
  form.append(buttonsSection);

  const actions = el("div", { className: "inline-actions" });
  const submitButton = createButton("保存する", { type: "submit" });
  actions.append(submitButton);
  form.append(actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      channel_id: channelInput.value.trim(),
      title_template: titleInput.value.trim() || defaultWelcome.title_template,
      description_template: descriptionArea.value.trim() || defaultWelcome.description_template,
      member_index_mode: memberIndexSelect.value,
      join_field_label: joinLabelInput.value.trim() || defaultWelcome.join_field_label,
      join_timezone: timezoneSelect.value,
      footer_text: footerInput.value.trim() || defaultWelcome.footer_text,
      thread_name_template: threadInput.value.trim() || null,
      buttons: [],
    };

    buttonsContainer.querySelectorAll(".button-row").forEach((row) => {
      const label = row.querySelector('[data-field="label"]').value.trim();
      const target = row.querySelector('[data-field="target"]').value;
      const value = row.querySelector('[data-field="value"]').value.trim();
      const emoji = row.querySelector('[data-field="emoji"]').value.trim();
      if (!label || !value) {
        return;
      }
      const entry = { label, target, value };
      if (emoji) {
        entry.emoji = emoji;
      }
      payload.buttons.push(entry);
    });

    toggleLoading(form, true);
    try {
      const data = await state.request("/api/welcome.post", payload);
      if (data.config) {
        state.updateSnapshot("welcome", data.config);
      }
      showToast("Welcome 設定を保存しました。", "success");
      clear(root);
      await renderWelcome({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "保存に失敗しました。", "error");
    } finally {
      toggleLoading(form, false);
    }
  });

  section.append(form);
  root.append(section);
}
