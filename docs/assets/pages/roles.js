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

const defaultRoles = {
  channel_id: "",
  style: "buttons",
  message_content: "",
  roles: [],
};

function createRoleRow(container, initial = {}) {
  const row = el("div", { className: "role-row" });
  const roleIdInput = textInput({ value: initial.role_id || "", placeholder: "ロールID" });
  roleIdInput.dataset.field = "role_id";
  const labelInput = textInput({ value: initial.label || "", placeholder: "表示名" });
  labelInput.dataset.field = "label";
  const descInput = textInput({ value: initial.description || "", placeholder: "説明 (任意)" });
  descInput.dataset.field = "description";
  const emojiInput = textInput({ value: initial.emoji || "", placeholder: "Emoji (任意)" });
  emojiInput.dataset.field = "emoji";
  const hiddenInput = el("input", { type: "checkbox" });
  hiddenInput.checked = Boolean(initial.hidden);
  hiddenInput.dataset.field = "hidden";
  const sortInput = textInput({ type: "number", value: initial.sort_order ?? 0, placeholder: "並び順" });
  sortInput.dataset.field = "sort_order";

  row.append(
    formField("ロールID", roleIdInput),
    formField("表示名", labelInput),
    formField("説明", descInput),
    formField("絵文字", emojiInput),
    formField("非表示", hiddenInput),
    formField("並び順", sortInput),
  );

  const removeBtn = createButton("削除", { variant: "secondary" });
  removeBtn.addEventListener("click", () => row.remove());
  row.append(el("div", { className: "inline-actions" }, removeBtn));
  container.append(row);
}

export async function renderRoles({ state, root, showToast }) {
  const snapshot = await ensureSnapshot(state, root).catch(() => null);
  if (!snapshot) {
    return;
  }

  const config = { ...defaultRoles, ...(snapshot.roles || {}) };

  const section = createSection("ロール配布", "ボタン/メニュー/リアクションで付与するロールを編集します。");
  const form = el("form");
  const channelInput = textInput({ value: config.channel_id || "", placeholder: "チャンネルID", required: true });
  const styleSelect = select({
    value: config.style || "buttons",
    options: [
      { value: "buttons", label: "ボタン" },
      { value: "select", label: "セレクトメニュー" },
      { value: "reactions", label: "リアクション" },
    ],
  });
  const messageContentArea = textarea({ value: config.message_content || "", rows: 3, placeholder: "任意の説明文" });

  form.append(
    formField("投稿チャンネルID", channelInput),
    formField("UIスタイル", styleSelect),
    formField("メッセージ本文", messageContentArea, "空欄なら既定の案内文が使用されます"),
  );

  const rolesContainer = el("div", { className: "role-list" });
  (config.roles || []).forEach((role) => createRoleRow(rolesContainer, role));
  if (!rolesContainer.childElementCount) {
    createRoleRow(rolesContainer);
  }
  const addRoleBtn = createButton("ロールを追加", { variant: "secondary" });
  addRoleBtn.addEventListener("click", () => createRoleRow(rolesContainer));

  form.append(rolesContainer, el("div", { className: "inline-actions" }, addRoleBtn));

  const submitButton = createButton("ロール設定を保存", { type: "submit" });
  form.append(el("div", { className: "inline-actions" }, submitButton));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      channel_id: channelInput.value.trim(),
      style: styleSelect.value,
      message_content: messageContentArea.value.trim() || null,
      roles: [],
    };

    rolesContainer.querySelectorAll(".role-row").forEach((row) => {
      const roleId = row.querySelector('[data-field="role_id"]').value.trim();
      const label = row.querySelector('[data-field="label"]').value.trim();
      if (!roleId || !label) {
        return;
      }
      const description = row.querySelector('[data-field="description"]').value.trim();
      const emoji = row.querySelector('[data-field="emoji"]').value.trim();
      const hidden = row.querySelector('[data-field="hidden"]').checked;
      const sortValue = row.querySelector('[data-field="sort_order"]').value;
      const entry = {
        role_id: roleId,
        label,
        hidden,
        sort_order: Number(sortValue) || 0,
      };
      if (description) {
        entry.description = description;
      }
      if (emoji) {
        entry.emoji = emoji;
      }
      payload.roles.push(entry);
    });

    toggleLoading(form, true);
    try {
      const data = await state.request("/api/roles.post", payload);
      if (data.config) {
        state.updateSnapshot("roles", data.config);
      }
      showToast("ロール設定を保存しました。", "success");
      clear(root);
      await renderRoles({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "保存に失敗しました。", "error");
    } finally {
      toggleLoading(form, false);
    }
  });

  section.append(form);

  const emojiSection = createSection("リアクション絵文字対応");
  const mapForm = el("form");
  const emojiRoleId = textInput({ value: "", placeholder: "ロールID" });
  const emojiValue = textInput({ value: "", placeholder: "emoji または :custom:" });
  mapForm.append(
    formField("ロールID", emojiRoleId),
    formField("絵文字", emojiValue, "空欄にすると対応付けを削除します"),
    el("div", { className: "inline-actions" }, createButton("保存", { type: "submit" })),
  );

  mapForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      role_id: emojiRoleId.value.trim(),
      emoji: emojiValue.value.trim() || null,
    };
    if (!payload.role_id) {
      showToast("ロールIDを入力してください。", "error");
      return;
    }

    toggleLoading(mapForm, true);
    try {
      const data = await state.request("/api/roles.mapEmoji", payload);
      state.updateSnapshot("role_emoji_map", data.mapping);
      showToast("絵文字マッピングを更新しました。", "success");
    } catch (error) {
      showToast(error.message || "更新に失敗しました。", "error");
    } finally {
      toggleLoading(mapForm, false);
    }
  });

  emojiSection.append(mapForm);

  const currentMap = state.snapshot?.role_emoji_map || {};
  const mapEntries = Object.entries(currentMap);
  if (mapEntries.length) {
    const list = el("ul");
    mapEntries.forEach(([roleId, emoji]) => {
      list.append(el("li", {}, `${roleId}: ${emoji}`));
    });
    emojiSection.append(list);
  }

  const removeSection = createSection("ロール設定の削除");
  const removeForm = el("form");
  const removeInput = textInput({ value: "", placeholder: "ロールID (空欄で全削除)" });
  removeForm.append(
    formField("削除対象", removeInput, "特定ロールIDを入力するとその行だけ削除します"),
    el("div", { className: "inline-actions" }, createButton("削除", { type: "submit", variant: "danger" })),
  );

  removeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = { role_id: removeInput.value.trim() || null };
    toggleLoading(removeForm, true);
    try {
      const data = await state.request("/api/roles.remove", payload);
      state.updateSnapshot("roles", data.config || null);
      if (!payload.role_id) {
        state.updateSnapshot("role_emoji_map", {});
      }
      showToast("ロール設定を更新しました。", "success");
      clear(root);
      await renderRoles({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "削除に失敗しました。", "error");
    } finally {
      toggleLoading(removeForm, false);
    }
  });

  removeSection.append(removeForm);

  const previewSection = createSection("プレビュー");
  const previewForm = el("form");
  const localeSelect = select({
    value: "ja-JP",
    options: [
      { value: "ja-JP", label: "日本語" },
      { value: "en-US", label: "English" },
    ],
  });
  const previewArea = el("pre", { textContent: "" });
  previewForm.append(
    formField("表示言語", localeSelect),
    el("div", { className: "inline-actions" }, createButton("生成", { type: "submit" })),
    previewArea,
  );

  previewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    toggleLoading(previewForm, true);
    try {
      const data = await state.request("/api/roles.preview", { locale: localeSelect.value });
      previewArea.textContent = JSON.stringify(data.preview, null, 2);
    } catch (error) {
      showToast(error.message || "プレビューに失敗しました。", "error");
    } finally {
      toggleLoading(previewForm, false);
    }
  });

  previewSection.append(previewForm);

  root.append(section, emojiSection, removeSection, previewSection);
}
