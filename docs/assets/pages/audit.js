import {
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

function renderTable(rows = []) {
  const wrapper = el("div", { className: "table-scroll" });
  if (!rows.length) {
    wrapper.append(el("p", { textContent: "結果はありません。" }));
    return wrapper;
  }
  const table = el("table");
  const thead = el("thead");
  const headerRow = el("tr");
  ["timestamp", "action", "ok", "actor_id", "channel_id", "error"].forEach((col) => {
    headerRow.append(el("th", { textContent: col }));
  });
  thead.append(headerRow);
  table.append(thead);
  const tbody = el("tbody");
  rows.forEach((row) => {
    const tr = el("tr");
    headerRow.childNodes.forEach((th) => {
      const key = th.textContent;
      tr.append(el("td", { textContent: row[key] ?? "" }));
    });
    tbody.append(tr);
  });
  table.append(tbody);
  wrapper.append(table);
  return wrapper;
}

export async function renderAudit({ state, root, showToast }) {
  const snapshot = await ensureSnapshot(state, root).catch(() => null);
  if (!snapshot) {
    return;
  }

  const recentSection = createSection("最近の監査", "最新のイベントを表示します。最大50件。");
  recentSection.append(renderTable(snapshot.audit_recent || []));

  const searchSection = createSection("監査検索");
  const searchForm = el("form");
  const sinceInput = textInput({ type: "datetime-local" });
  const untilInput = textInput({ type: "datetime-local" });
  const actionInput = textInput({ value: "", placeholder: "アクション" });
  const userInput = textInput({ value: "", placeholder: "ユーザーID" });
  const channelInput = textInput({ value: "", placeholder: "チャンネルID" });
  const limitInput = textInput({ type: "number", value: 50, placeholder: "最大件数" });
  const resultsContainer = el("div");

  searchForm.append(
    formField("開始日時", sinceInput),
    formField("終了日時", untilInput),
    formField("アクション", actionInput),
    formField("ユーザーID", userInput),
    formField("チャンネルID", channelInput),
    formField("件数", limitInput),
    el("div", { className: "inline-actions" }, createButton("検索", { type: "submit" })),
    resultsContainer,
  );

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      since: sinceInput.value ? new Date(sinceInput.value).toISOString() : null,
      until: untilInput.value ? new Date(untilInput.value).toISOString() : null,
      action: actionInput.value.trim() || null,
      user_id: userInput.value.trim() || null,
      channel_id: channelInput.value.trim() || null,
      limit: Number(limitInput.value) || 50,
    };

    toggleLoading(searchForm, true);
    try {
      const data = await state.request("/api/audit.search", payload);
      resultsContainer.innerHTML = "";
      resultsContainer.append(renderTable(data.results || []));
    } catch (error) {
      showToast(error.message || "検索に失敗しました。", "error");
    } finally {
      toggleLoading(searchForm, false);
    }
  });

  searchSection.append(searchForm);

  const exportSection = createSection("エクスポート");
  const exportForm = el("form");
  const formatSelect = select({
    value: "ndjson",
    options: [
      { value: "ndjson", label: "NDJSON" },
      { value: "csv", label: "CSV" },
    ],
  });
  const exportArea = textarea({ value: "", rows: 8, placeholder: "エクスポート結果" });
  exportForm.append(
    formField("フォーマット", formatSelect),
    el("div", { className: "inline-actions" }, createButton("エクスポート", { type: "submit" })),
    exportArea,
  );

  exportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    toggleLoading(exportForm, true);
    try {
      const payload = {
        format: formatSelect.value,
      };
      const data = await state.request("/api/audit.export", payload);
      exportArea.value = data.content || "";
      showToast("エクスポートが完了しました。", "success");
    } catch (error) {
      showToast(error.message || "エクスポートに失敗しました。", "error");
    } finally {
      toggleLoading(exportForm, false);
    }
  });

  exportSection.append(exportForm);

  root.append(recentSection, searchSection, exportSection);
}
