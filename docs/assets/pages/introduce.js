import {
  clear,
  createButton,
  createSection,
  el,
  ensureSnapshot,
  formField,
  textInput,
  textarea,
  toggleLoading,
} from "../ui.js";

const defaultIntroduce = {
  channel_id: "",
  mention_role_ids: [],
  embed_title: "自己紹介",
  footer_text: "",
};

function createFieldRow(container, initial = {}) {
  const row = el("div", { className: "field-row" });
  const idInput = textInput({ value: initial.field_id || "", placeholder: "field_id" });
  idInput.dataset.field = "field_id";
  const labelInput = textInput({ value: initial.label || "", placeholder: "ラベル" });
  labelInput.dataset.field = "label";
  const placeholderInput = textInput({ value: initial.placeholder || "", placeholder: "プレースホルダー" });
  placeholderInput.dataset.field = "placeholder";
  const requiredInput = el("input", { type: "checkbox" });
  requiredInput.checked = initial.required !== undefined ? initial.required : true;
  requiredInput.dataset.field = "required";
  const enabledInput = el("input", { type: "checkbox" });
  enabledInput.checked = initial.enabled !== undefined ? initial.enabled : true;
  enabledInput.dataset.field = "enabled";
  const maxLengthInput = textInput({ type: "number", value: initial.max_length ?? 300, placeholder: "最大文字数" });
  maxLengthInput.dataset.field = "max_length";

  row.append(
    formField("フィールドID", idInput),
    formField("ラベル", labelInput),
    formField("プレースホルダー", placeholderInput),
    formField("必須", requiredInput),
    formField("有効", enabledInput),
    formField("最大文字数", maxLengthInput),
  );

  const removeBtn = createButton("削除", { variant: "secondary" });
  removeBtn.addEventListener("click", () => row.remove());
  row.append(el("div", { className: "inline-actions" }, removeBtn));
  container.append(row);
}

export async function renderIntroduce({ state, root, showToast }) {
  const snapshot = await ensureSnapshot(state, root).catch(() => null);
  if (!snapshot) {
    return;
  }

  const config = { ...defaultIntroduce, ...(snapshot.introduce || {}) };
  const schema = snapshot.introduce_schema || { fields: [] };

  const configSection = createSection("自己紹介投稿", "自己紹介メッセージの投稿先と装飾を設定します。");
  const configForm = el("form");
  const channelInput = textInput({ value: config.channel_id || "", placeholder: "チャンネルID", required: true });
  const mentionInput = textarea({
    value: (config.mention_role_ids || []).join("\n"),
    rows: 3,
    placeholder: "メンションしたいロールIDを1行ずつ",
  });
  const titleInput = textInput({ value: config.embed_title || defaultIntroduce.embed_title });
  const footerInput = textInput({ value: config.footer_text || "", placeholder: "フッター (任意)" });

  configForm.append(
    formField("投稿チャンネルID", channelInput),
    formField("メンションするロールID", mentionInput, "複数行で指定すると順番にメンションします"),
    formField("Embedタイトル", titleInput),
    formField("フッター", footerInput),
    el("div", { className: "inline-actions" }, createButton("保存", { type: "submit" })),
  );

  configForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mentionRoleIds = mentionInput.value
      .split(/\r?\n|,/)
      .map((v) => v.trim())
      .filter(Boolean);

    const payload = {
      channel_id: channelInput.value.trim(),
      mention_role_ids: mentionRoleIds,
      embed_title: titleInput.value.trim() || defaultIntroduce.embed_title,
      footer_text: footerInput.value.trim() || null,
    };

    toggleLoading(configForm, true);
    try {
      const data = await state.request("/api/introduce.post", payload);
      if (data.config) {
        state.updateSnapshot("introduce", data.config);
      }
      showToast("自己紹介設定を保存しました。", "success");
      clear(root);
      await renderIntroduce({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "保存に失敗しました。", "error");
    } finally {
      toggleLoading(configForm, false);
    }
  });

  configSection.append(configForm);

  const schemaSection = createSection("モーダル項目", "自己紹介フォームの項目を編集します。");
  const schemaForm = el("form");
  const fieldsContainer = el("div", { className: "field-list" });
  (schema.fields || []).forEach((field) => createFieldRow(fieldsContainer, field));
  if (!fieldsContainer.childElementCount) {
    createFieldRow(fieldsContainer);
  }
  const addFieldBtn = createButton("項目を追加", { variant: "secondary" });
  addFieldBtn.addEventListener("click", () => createFieldRow(fieldsContainer));

  schemaForm.append(fieldsContainer, el("div", { className: "inline-actions" }, addFieldBtn));
  schemaForm.append(el("div", { className: "inline-actions" }, createButton("スキーマを保存", { type: "submit" })));

  schemaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fields = [];
    fieldsContainer.querySelectorAll(".field-row").forEach((row) => {
      const fieldId = row.querySelector('[data-field="field_id"]').value.trim();
      const label = row.querySelector('[data-field="label"]').value.trim();
      if (!fieldId || !label) {
        return;
      }
      const placeholder = row.querySelector('[data-field="placeholder"]').value.trim();
      const required = row.querySelector('[data-field="required"]').checked;
      const enabled = row.querySelector('[data-field="enabled"]').checked;
      const maxLength = Number(row.querySelector('[data-field="max_length"]').value) || 300;
      const entry = {
        field_id: fieldId,
        label,
        required,
        enabled,
        max_length: maxLength,
      };
      if (placeholder) {
        entry.placeholder = placeholder;
      }
      fields.push(entry);
    });

    const payload = { fields };

    toggleLoading(schemaForm, true);
    try {
      const data = await state.request("/api/introduce.schema.save", payload);
      if (data.schema) {
        state.updateSnapshot("introduce_schema", data.schema);
      }
      showToast("スキーマを保存しました。", "success");
      clear(root);
      await renderIntroduce({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "保存に失敗しました。", "error");
    } finally {
      toggleLoading(schemaForm, false);
    }
  });

  schemaSection.append(schemaForm);

  root.append(configSection, schemaSection);
}
