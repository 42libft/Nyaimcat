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

function createAttachmentRow(container, initial = "") {
  const row = el("div", { className: "attachment-row" });
  const input = textInput({ type: "url", value: initial, placeholder: "https://assets.example" });
  row.append(formField("添付URL", input));
  const removeBtn = createButton("削除", { variant: "secondary" });
  removeBtn.addEventListener("click", () => row.remove());
  row.append(el("div", { className: "inline-actions" }, removeBtn));
  container.append(row);
}

export async function renderGuideline({ state, root, showToast }) {
  const snapshot = await ensureSnapshot(state, root).catch(() => null);
  if (!snapshot) {
    return;
  }

  const template = snapshot.guideline || { content: "", attachments: [] };

  const section = createSection("ガイドラインDM", "入室時に送るDMテンプレートを編集します。");
  const form = el("form");
  const contentArea = textarea({ value: template.content || "", rows: 10, placeholder: "DMに送る本文" });
  const attachmentsContainer = el("div", { className: "attachment-list" });
  (template.attachments || []).forEach((url) => createAttachmentRow(attachmentsContainer, url));
  if (!attachmentsContainer.childElementCount) {
    createAttachmentRow(attachmentsContainer);
  }
  const addAttachmentButton = createButton("添付URLを追加", { variant: "secondary" });
  addAttachmentButton.addEventListener("click", () => createAttachmentRow(attachmentsContainer));

  form.append(
    formField("DM本文", contentArea, "Markdown を含むテキストを入力します"),
    attachmentsContainer,
    el("div", { className: "inline-actions" }, addAttachmentButton),
  );

  const submitButton = createButton("テンプレートを保存", { type: "submit" });
  form.append(el("div", { className: "inline-actions" }, submitButton));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const attachments = [];
    attachmentsContainer.querySelectorAll("input[type='url']").forEach((input) => {
      const value = input.value.trim();
      if (value) {
        attachments.push(value);
      }
    });

    const payload = {
      content: contentArea.value.trim(),
      attachments,
    };

    toggleLoading(form, true);
    try {
      const data = await state.request("/api/guideline.save", payload);
      if (data.template) {
        state.updateSnapshot("guideline", data.template);
      }
      showToast("ガイドラインを保存しました。", "success");
      clear(root);
      await renderGuideline({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "保存に失敗しました。", "error");
    } finally {
      toggleLoading(form, false);
    }
  });

  section.append(form);

  const testSection = createSection("プレビュー送信");
  const testForm = el("form");
  const targetInput = textInput({ value: "", placeholder: "DiscordユーザーID (任意)" });
  const dryRunToggle = el("input", { type: "checkbox" });
  dryRunToggle.checked = true;
  const dryRunField = formField(
    "Dry-run",
    dryRunToggle,
    "チェックしたままなら実際には送信しません",
  );

  const previewArea = el("pre", { textContent: "" });

  testForm.append(
    formField("対象ユーザー", targetInput, "省略するとサーバー側のダミーIDで検証します"),
    dryRunField,
    el("div", { className: "inline-actions" }, createButton("テストリクエスト", { type: "submit" })),
    previewArea,
  );

  testForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      target_user_id: targetInput.value.trim() || null,
      dry_run: dryRunToggle.checked,
    };

    toggleLoading(testForm, true);
    try {
      const data = await state.request("/api/guideline.test", payload);
      previewArea.textContent = JSON.stringify(data.preview, null, 2);
      showToast("テストリクエストを送信しました。", "success");
    } catch (error) {
      showToast(error.message || "テストに失敗しました。", "error");
    } finally {
      toggleLoading(testForm, false);
    }
  });

  testSection.append(testForm);

  root.append(section, testSection);
}
